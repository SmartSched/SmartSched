# Behavior learning

SmartSched learns only soft ranking preferences from behavior. The CSP scheduler remains the source of truth for fixed blocks, availability, deadlines, travel, and no-overlap constraints. A learned preference can rank valid plans; it cannot make an invalid calendar valid.

## Events

`user_learning_events` stores structured, per-user observations (and deliberately excludes task titles and descriptions):

- `task_created`: task type, priority, estimate, and due date.
- `task_edited`: only changed estimate, due date, priority, or type fields.
- `task_completed`: type, estimate, recorded actual minutes, and due date.
- `schedule_accepted`: selected option metadata and planned block date/time/type summaries.
- `study_block_moved`: old and new date/time.
- `study_block_deleted` / `study_block_skipped`: planned date/time and an optional short reason.
- `study_block_completed`: reserved for a future per-block completion control. Today, completion is tracked at task level.

RLS permits a signed-in user to select or insert only rows whose `user_id` is their own. The Express server writes these events with the user's Supabase JWT, so this restriction also applies to server aggregation.

## Refresh and model input

When a user has at least 10 new learning events since the last preference update (or their preferences are missing, survey-stale, or a week old), the next suggestion refreshes rule-derived preferences. `POST /api/preferences/refresh` is also an authenticated manual refresh.

The Hugging Face request is started after the rule preferences are saved and is not awaited by schedule suggestion or manual refresh responses. It receives the survey plus a 90-day aggregate: study hour/day counts, mean session length, estimate-vs-actual ratios by task type, accepted-plan count, move/delete rates, and completion timing. A true acceptance rate is intentionally omitted until rejected suggestions are logged too. It never receives raw event history or task text. If Hugging Face, aggregation, or validation fails, the previously saved valid preferences remain in use.

## Preference JSON schema

`profiles.scheduler_preferences` is a JSON object with `summary`, `preferences`, and `adjustments` arrays. Preferences may be `activity_window`, `session_length`, `daily_load`, `min_gap`, `protect_time`, `deadline_buffer`, or `distribution`. Adjustments are `estimate_multiplier` entries keyed by task type. The full canonical schema and Python-side cleaner are in `ml/prefs/schema.py`; Node validates the outer shape, kinds, and numeric bounds before saving model output.

## Environment

- `MODEL_URL`: private Hugging Face Gradio Space base URL. Leave unset to disable model calls safely.
- `MODEL_HF_TOKEN`: Hugging Face access token for the private Space.
- `MODEL_API_KEY` (or `SERVICE_API_KEY`): shared service key passed to the Space.
- `SCHEDULER_URL` and `SERVICE_API_KEY`: existing CSP service endpoint/key used for rule/history generation.

No frontend variable contains a model URL, token, or key.

## Local check

1. Apply migrations with `npx supabase db push`.
2. Start the CSP service and `cd server && npm test`.
3. Start the Express server and frontend, then create/edit/complete tasks, accept a plan, and move/delete task blocks.
4. Call `POST /api/preferences/refresh` with `{ "now": "YYYY-MM-DDTHH:MM", "tzOffset": 420 }`, authenticated as that user. Inspect `user_learning_events` and `profiles.scheduler_preferences` in local Supabase. With `MODEL_URL` unset, the rule preferences still refresh and scheduling remains available.
