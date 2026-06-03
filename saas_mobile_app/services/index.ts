// ============================================
// Services Export Index
// ============================================

export { serverApi } from '@/lib/serverApi';
export type { ApiResponse } from '@/types';
export { authService } from './authService';
export { ticketService } from './ticketService';
export { userService } from './userService';
export { reportService } from './reportService';
export { stockService } from './stockService';
export { sopService } from './sopService';
export { vmsService } from './vmsService';
export { ppmService } from './ppmService';
export { checklistService } from './checklistService';
export { electricityService } from './electricityService';
export { dieselService } from './dieselService';
export {
  getMeetingRooms,
  getMeetingRoomBookings,
  getMeetingRoomCredits,
  createMeetingRoomBooking,
  cancelMeetingRoomBookingApi,
  createMeetingRoomApi,
  updateMeetingRoomApi,
  deleteMeetingRoomApi,
  uploadMeetingRoomPhoto,
  updateMeetingRoomCreditsApi,
  getCompaniesWithCreditsApi,
} from './meetingRoomService';
export { propertyService } from './propertyService';

// Re-export types
export type { LoginCredentials, SignupData, ResetPasswordData, UpdatePasswordData } from './authService';
export type { CreateTicketData, UpdateTicketData, TicketFilters } from './ticketService';
export type { CreateUserData, UpdateUserData, UserFilters } from './userService';
export type { DashboardStats } from '@/types';
export type { DateFilter, VisitorLog, VisitorStats, HostResult } from './vmsService';
export type { MeetingRoom, MeetingRoomBooking, MeetingRoomCredit } from './meetingRoomService';
export type { PPMSchedule, AMCContract, PPMStats, PPMUpdatePayload, MaintenanceVendor } from './ppmService';
export type { SOPTemplate, SOPChecklistItem, SOPCompletion, SOPCompletionItem, ChecklistFilters } from './checklistService';
export type { ElectricityMeter, ElectricityReading, GridTariff, MeterMultiplier, ReadingPayload as ElectricityReadingPayload } from './electricityService';
export type { Generator, DieselReading, DGTariff, ReadingPayload as DieselReadingPayload } from './dieselService';
