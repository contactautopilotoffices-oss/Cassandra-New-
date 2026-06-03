import { create } from 'zustand';
import { MeetingRoom, MeetingRoomBooking, MeetingRoomCredit } from '@/services/meetingRoomService';

interface MeetingRoomState {
  rooms: MeetingRoom[];
  bookings: MeetingRoomBooking[];
  credit: MeetingRoomCredit | null;
  hasLoadedInitialData: boolean;
  setRooms: (rooms: MeetingRoom[]) => void;
  setBookings: (bookings: MeetingRoomBooking[]) => void;
  setCredit: (credit: MeetingRoomCredit | null) => void;
  setHasLoadedInitialData: (loaded: boolean) => void;
  clearCache: () => void;
}

export const useMeetingRoomStore = create<MeetingRoomState>((set) => ({
  rooms: [],
  bookings: [],
  credit: null,
  hasLoadedInitialData: false,
  setRooms: (rooms) => set({ rooms }),
  setBookings: (bookings) => set({ bookings }),
  setCredit: (credit) => set({ credit }),
  setHasLoadedInitialData: (loaded) => set({ hasLoadedInitialData: loaded }),
  clearCache: () => set({ rooms: [], bookings: [], credit: null, hasLoadedInitialData: false }),
}));
