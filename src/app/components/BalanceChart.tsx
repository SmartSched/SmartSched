import { Card, CardContent, Typography, Box } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BalanceData {
  name: string;
  hours: number;
  type: 'study' | 'personal' | 'sleep';
}

interface BalanceChartProps {
  data: BalanceData[];
}

export function BalanceChart({ data }: BalanceChartProps) {
  const getColor = (type: string) => {
    switch (type) {
      case 'study':
        return '#3b82f6';
      case 'personal':
        return '#10b981';
      case 'sleep':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  const totalHours = data.reduce((sum, item) => sum + item.hours, 0);
  const studyHours = data.find(d => d.type === 'study')?.hours || 0;
  const personalHours = data.find(d => d.type === 'personal')?.hours || 0;
  const sleepHours = data.find(d => d.type === 'sleep')?.hours || 0;

  const isBalanced = studyHours <= 8 && personalHours >= 4 && sleepHours >= 7;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
          Weekly Balance
        </Typography>

        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} label={{ value: 'Hours/Day', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.type)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#3b82f6' }}>
              {studyHours}h
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Study/Day
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#10b981' }}>
              {personalHours}h
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Personal/Day
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#8b5cf6' }}>
              {sleepHours}h
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Sleep/Day
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: '12px',
            backgroundColor: isBalanced ? '#d1fae5' : '#fef3c7',
            border: '2px solid',
            borderColor: isBalanced ? '#10b981' : '#fbbf24',
          }}
        >
          <Typography variant="body2" sx={{ color: isBalanced ? '#065f46' : '#92400e', fontWeight: 500 }}>
            {isBalanced
              ? '🎉 Amazing job! You\'re taking great care of yourself! Keep up this wonderful balance.'
              : '💝 Remember: rest is productive too! Try adding more personal time and sleep to recharge your amazing brain.'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
