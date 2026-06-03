import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MiniBarChartProps {
  data: { day: string; count: number }[];
}

/**
 * Maps single-letter day abbreviations to 3-letter abbreviations for clarity (Issue #16)
 */
const mapDay = (day: string, index: number) => {
  if (day.length > 1) return day;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days[index % 7] || day;
};

export default function MiniBarChart({ data }: MiniBarChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);
  
  return (
    <View style={styles.miniBarChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  height: `${Math.max((d.count / max) * 100, 5)}%`,
                  backgroundColor: i === data.length - 1 ? 'rgba(112,143,150,0.80)' : 'rgba(0,0,0,0.12)',
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  miniBarChart: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    gap: 5, 
    height: 50, 
    width: 90 
  },
  barCol: { 
    flex: 1, 
    alignItems: 'center' 
  },
  barTrack: { 
    flex: 1, 
    width: '100%', 
    justifyContent: 'flex-end' 
  },
  barFill: { 
    width: '100%', 
    borderRadius: 2, 
    minHeight: 2 
  },
});
