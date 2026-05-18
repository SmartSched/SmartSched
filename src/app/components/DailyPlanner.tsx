import { useState } from 'react';
import { Card, CardContent, Typography, Box, Button, TextField, Select, MenuItem, FormControl, InputLabel, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Add, Edit, Delete, DragIndicator } from '@mui/icons-material';
import { format } from 'date-fns';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  type: 'class' | 'study' | 'break' | 'personal' | 'commute' | 'meal';
  color: string;
}

interface DailyPlannerProps {
  selectedDate: Date;
  timeBlocks: TimeBlock[];
  onAddBlock: (block: Omit<TimeBlock, 'id'>) => void;
  onDeleteBlock: (id: string) => void;
  onReorderBlocks: (blocks: TimeBlock[]) => void;
}

interface DraggableBlockProps {
  block: TimeBlock;
  index: number;
  moveBlock: (dragIndex: number, hoverIndex: number) => void;
  onDelete: (id: string) => void;
  getTypeEmoji: (type: string) => string;
}

function DraggableBlock({ block, index, moveBlock, onDelete, getTypeEmoji }: DraggableBlockProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'timeBlock',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'timeBlock',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveBlock(item.index, index);
        item.index = index;
      }
    },
  });

  return (
    <Box
      ref={(node) => drag(drop(node))}
      sx={{
        mb: 1,
        p: 1.5,
        backgroundColor: block.color + '20',
        border: `2px solid ${block.color}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
        transition: 'opacity 0.2s',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
      }}
    >
      <DragIndicator sx={{ color: block.color, cursor: 'grab' }} />
      <Typography variant="body2" sx={{ fontSize: '18px' }}>
        {getTypeEmoji(block.type)}
      </Typography>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: block.color }}>
          {block.activity}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {block.startTime} - {block.endTime}
        </Typography>
      </Box>
      <IconButton size="small" onClick={() => onDelete(block.id)}>
        <Delete fontSize="small" />
      </IconButton>
    </Box>
  );
}

export function DailyPlanner({ selectedDate, timeBlocks, onAddBlock, onDeleteBlock, onReorderBlocks }: DailyPlannerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [newBlock, setNewBlock] = useState({
    startTime: '09:00',
    endTime: '10:00',
    activity: '',
    type: 'study' as const,
  });

  const moveBlock = (dragIndex: number, hoverIndex: number) => {
    const draggedBlock = sortedBlocks[dragIndex];
    const newBlocks = [...sortedBlocks];
    newBlocks.splice(dragIndex, 1);
    newBlocks.splice(hoverIndex, 0, draggedBlock);
    onReorderBlocks(newBlocks);
  };

  const hours = Array.from({ length: 15 }, (_, i) => i + 7);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'class':
        return '#3b82f6';
      case 'study':
        return '#8b5cf6';
      case 'break':
        return '#10b981';
      case 'personal':
        return '#ec4899';
      case 'commute':
        return '#f59e0b';
      case 'meal':
        return '#06b6d4';
      default:
        return '#6b7280';
    }
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'class':
        return '📚';
      case 'study':
        return '✏️';
      case 'break':
        return '☕';
      case 'personal':
        return '🌟';
      case 'commute':
        return '🚗';
      case 'meal':
        return '🍽️';
      default:
        return '📌';
    }
  };

  const handleAddBlock = () => {
    if (newBlock.activity.trim()) {
      onAddBlock({
        ...newBlock,
        color: getTypeColor(newBlock.type),
      });
      setNewBlock({
        startTime: '09:00',
        endTime: '10:00',
        activity: '',
        type: 'study',
      });
      setShowDialog(false);
    }
  };

  const getBlocksForHour = (hour: number) => {
    const hourStr = `${hour.toString().padStart(2, '0')}:00`;
    return timeBlocks.filter(block => {
      const blockHour = parseInt(block.startTime.split(':')[0]);
      return blockHour === hour;
    });
  };

  const sortedBlocks = [...timeBlocks].sort((a, b) => {
    const timeA = a.startTime.split(':').map(Number);
    const timeB = b.startTime.split(':').map(Number);
    return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
  });

  return (
    <DndProvider backend={HTML5Backend}>
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#8b5cf6' }}>
          Daily Schedule for {format(selectedDate, 'EEEE, MMM d')} 📋
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowDialog(true)}
          sx={{
            borderRadius: '12px',
            textTransform: 'none',
            backgroundColor: '#8b5cf6',
            '&:hover': {
              backgroundColor: '#7c3aed',
            },
          }}
        >
          Add Time Block
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, gap: 3 }}>
        <Card sx={{ borderRadius: '16px', height: 'fit-content' }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#8b5cf6' }}>
              Quick Stats 📊
            </Typography>
            {['class', 'study', 'break', 'personal'].map(type => {
              const count = timeBlocks.filter(b => b.type === type).length;
              return (
                <Box key={type} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: getTypeColor(type),
                    }}
                  />
                  <Typography variant="caption" sx={{ textTransform: 'capitalize', flex: 1 }}>
                    {getTypeEmoji(type)} {type}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {count}
                  </Typography>
                </Box>
              );
            })}
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: '16px' }}>
          <CardContent>
            <Box sx={{ position: 'relative' }}>
              {hours.map((hour, index) => (
                <Box key={hour} sx={{ display: 'flex', minHeight: '80px', borderBottom: index < hours.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                  <Box sx={{ width: '80px', pr: 2, pt: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, pl: 2, borderLeft: '2px solid #e5e7eb', pt: 1 }}>
                    {getBlocksForHour(hour).map((block, idx) => {
                      const blockIndex = sortedBlocks.findIndex(b => b.id === block.id);
                      return (
                        <DraggableBlock
                          key={block.id}
                          block={block}
                          index={blockIndex}
                          moveBlock={moveBlock}
                          onDelete={onDeleteBlock}
                          getTypeEmoji={getTypeEmoji}
                        />
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {sortedBlocks.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 2 }}>
            Your schedule is empty! 🌸
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add time blocks to plan your day and avoid burnout
          </Typography>
        </Box>
      )}

      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#8b5cf6' }}>Add Time Block</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              fullWidth
              label="Activity"
              value={newBlock.activity}
              onChange={(e) => setNewBlock({ ...newBlock, activity: e.target.value })}
              placeholder="e.g., CSC 453 Lecture"
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                fullWidth
                label="Start Time"
                type="time"
                value={newBlock.startTime}
                onChange={(e) => setNewBlock({ ...newBlock, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="End Time"
                type="time"
                value={newBlock.endTime}
                onChange={(e) => setNewBlock({ ...newBlock, endTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={newBlock.type}
                label="Type"
                onChange={(e) => setNewBlock({ ...newBlock, type: e.target.value as any })}
              >
                <MenuItem value="class">{getTypeEmoji('class')} Class</MenuItem>
                <MenuItem value="study">{getTypeEmoji('study')} Study</MenuItem>
                <MenuItem value="break">{getTypeEmoji('break')} Break</MenuItem>
                <MenuItem value="personal">{getTypeEmoji('personal')} Personal</MenuItem>
                <MenuItem value="commute">{getTypeEmoji('commute')} Commute</MenuItem>
                <MenuItem value="meal">{getTypeEmoji('meal')} Meal</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddBlock} sx={{ backgroundColor: '#8b5cf6' }}>
            Add Block
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
    </DndProvider>
  );
}
