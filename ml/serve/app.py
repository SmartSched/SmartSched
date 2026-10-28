"""The preference model as a service, run on the Hugging Face Space SmartSchedCalPoly/smartsched-api with
ZeroGPU (a shared GPU, included in PRO, that only Gradio Spaces can use).

One API endpoint, "prefs" (Gradio's /gradio_api/call/prefs; server/model.js calls it):
  inputs:  bundle (a user's history as ml/prefs/history.py writes it), survey (JSON text), key
  output:  {"prefs", "problems", "parsed", "fallback", "seconds", "version"}

The model reads the history with the system prompt it was trained on (llm.messages), and llm.read cleans
the reply with schema.clean. fallback is true when the reply couldn't be used and the survey-only
preferences came back instead; the Node server then keeps the rules' JSON it already saved.

The model is Qwen2.5-1.5B-Instruct with the LoRA adapter from the private repo ADAPTER_REPO (subfolder
adapter_prefs, read with the HF_TOKEN secret) merged in, in float16. ZeroGPU wants models placed on cuda
when the app starts; a real GPU is attached only while reply_text runs. Calls are queued one at a time.

build_space.sh copies this folder and the ml/prefs files it imports into a clone of the Space.
"""

import json
import os
import secrets
import time

import spaces  # before torch: ZeroGPU sets up CUDA for the model loaded below
import gradio as gr

import llm

BASE_MODEL = os.environ.get("BASE_MODEL", "Qwen/Qwen2.5-1.5B-Instruct")
ADAPTER_REPO = os.environ.get("ADAPTER_REPO", "SmartSchedCalPoly/smartsched-prefs-adapter")
ADAPTER_SUBFOLDER = "adapter_prefs"
MODEL_VERSION = os.environ.get("MODEL_VERSION", "qwen-lora-v1")
SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY")
MAX_NEW_TOKENS = int(os.environ.get("MAX_NEW_TOKENS", "1024"))


def load():
    import torch
    from huggingface_hub import snapshot_download
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    folder = snapshot_download(ADAPTER_REPO, token=os.environ.get("HF_TOKEN"), allow_patterns=[f"{ADAPTER_SUBFOLDER}/*"])
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, dtype=torch.float16)
    # Merging the adapter into the weights makes every step one matrix multiply instead of two. ZeroGPU
    # reports cuda as available at startup, so PEFT would load the adapter straight onto a GPU that isn't
    # attached yet; load it on the CPU and let model.to("cuda") below move everything.
    model = PeftModel.from_pretrained(model, os.path.join(folder, ADAPTER_SUBFOLDER), torch_device="cpu").merge_and_unload()
    model.to("cuda").eval()
    return tokenizer, model


TOKENIZER, MODEL = (None, None) if os.environ.get("SKIP_MODEL_LOAD") == "1" else load()


@spaces.GPU(duration=60)
def reply_text(bundle):
    """The model's raw reply for one user."""
    return llm.generate(TOKENIZER, MODEL, "cuda", [llm.messages(bundle)], max_new_tokens=MAX_NEW_TOKENS)[0]


def prefs(bundle, survey, key):
    if SERVICE_API_KEY and not secrets.compare_digest(key or "", SERVICE_API_KEY):
        raise gr.Error("Unauthorized")
    if not bundle or not bundle.strip():
        raise gr.Error("bundle is required")
    started = time.perf_counter()
    text = reply_text(bundle)
    result, info = llm.read(text, json.loads(survey) if survey else {})
    return {"prefs": result, "problems": info["problems"], "parsed": info["parsed"], "fallback": info["fallback"],
            "seconds": round(time.perf_counter() - started, 1), "version": MODEL_VERSION}


demo = gr.Interface(
    fn=prefs,
    inputs=[gr.Textbox(label="History bundle", lines=12), gr.Textbox(label="Survey (JSON)"),
            gr.Textbox(label="Service key", type="password")],
    outputs=gr.JSON(label="Preferences"),
    title="SmartSched preference model",
    api_name="prefs",
    flagging_mode="never",
)
demo.queue(default_concurrency_limit=1)

if __name__ == "__main__":
    demo.launch(show_error=True)  # so a wrong key reads "Unauthorized" in the Node logs, not null
