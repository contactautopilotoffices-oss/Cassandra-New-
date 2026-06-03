/**
 * gamification.ts — Types and demo data for the gamified MST UI.
 *
 * In production, real data comes from useGamification hook + backend.
 * This file provides fallback shapes and mock data.
 */

export interface UserStats {
  name: string;
  initials: string;
  level: number;
  levelName: string;
  xp: number;
  xpForNext: number;
  totalXp: number;
  streak: number;
  weeklyRank: number;
  weeklyTotal: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  tint: string;
}

export interface LeaderRow {
  rank: number;
  name: string;
  initials: string;
  property: string;
  xp: number;
  resolved: number;
  streak: number;
  isMe?: boolean;
  user_id?: string;
}

export interface Quest {
  id: string;
  title: string;
  reward: number;
  progress: number;
  total: number;
}

export const defaultMstUser: UserStats = {
  name: 'MST User',
  initials: 'MU',
  level: 1,
  levelName: 'Rookie',
  xp: 0,
  xpForNext: 500,
  totalXp: 0,
  streak: 0,
  weeklyRank: 1,
  weeklyTotal: 1,
};

export const defaultAchievements: Achievement[] = [
  {
    id: 'first-ticket',
    name: 'First Ticket',
    description: 'Resolve your first ticket',
    icon: 'checkmark-circle',
    unlocked: true,
    tint: '#34D399',
  },
  {
    id: 'week-streak',
    name: 'Week Streak',
    description: '7 days in a row',
    icon: 'flame',
    unlocked: true,
    tint: '#FBBF24',
  },
  {
    id: 'ticket-master',
    name: 'Ticket Master',
    description: 'Resolve 100 tickets',
    icon: 'trophy',
    unlocked: true,
    tint: '#FBBF24',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Resolve 10 after 10pm',
    icon: 'moon',
    unlocked: false,
    tint: '#A78BFA',
  },
  {
    id: 'top-resolver',
    name: 'Top Resolver',
    description: '#1 weekly leaderboard',
    icon: 'medal',
    unlocked: false,
    tint: '#60A5FA',
  },
  {
    id: 'power-saver',
    name: 'Power Saver',
    description: 'Reduce energy 10%',
    icon: 'flash',
    unlocked: false,
    tint: '#F59E0B',
  },
];

export const defaultLeaderboard: LeaderRow[] = [
  { rank: 1, name: 'Manjunatha A', initials: 'MA', property: 'SS Plaza', xp: 2840, resolved: 36, streak: 18, user_id: '1' },
  { rank: 2, name: 'Ravi Kumar', initials: 'RK', property: 'Rabale', xp: 2410, resolved: 31, streak: 9, user_id: '2' },
  { rank: 3, name: 'Amar Singh', initials: 'AS', property: 'SS Plaza', xp: 2180, resolved: 24, streak: 12, isMe: true, user_id: '3' },
  { rank: 4, name: 'Suresh N', initials: 'SN', property: 'ETPL Digitide', xp: 1920, resolved: 22, streak: 6, user_id: '4' },
  { rank: 5, name: 'Priya M', initials: 'PM', property: 'Head Office', xp: 1740, resolved: 19, streak: 4, user_id: '5' },
];

export const defaultQuests: Quest[] = [
  { id: 'q1', title: 'Resolve 5 tickets', reward: 50, progress: 3, total: 5 },
  { id: 'q2', title: 'Log diesel reading', reward: 20, progress: 1, total: 1 },
  { id: 'q3', title: 'Update meter reading', reward: 20, progress: 0, total: 1 },
];
