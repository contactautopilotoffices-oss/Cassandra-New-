import { serverApi } from '@/lib/serverApi';
import { getCurrentUserId } from '@/utils/api/mobileApi';

// ---------------------------------------------------------------------------
// Types (aligned with mobileApi.ts for drop-in replacement)
// ---------------------------------------------------------------------------

export interface MeetingRoom {
  id: string;
  property_id: string;
  name: string;
  photo_url?: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  status: string;
  created_by?: string;
  created_at: string;
}

export interface MeetingRoomBooking {
  id: string;
  meeting_room_id: string;
  property_id: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  company_id?: string;
  organization_id?: string;
  created_at: string;
  meeting_room?: { name: string; photo_url?: string; location?: string };
  tenant?: { full_name: string; email: string };
}

export interface MeetingRoomCredit {
  id: string;
  property_id: string;
  user_id?: string;
  company_id?: string;
  assigned_by?: string;
  monthly_hours: number;
  remaining_hours: number;
  last_reset_at: string;
  next_reset_at: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Meeting Room Service — routes through saas_mobile_server
// ---------------------------------------------------------------------------

export async function getMeetingRooms(propertyId: string, status?: string): Promise<{ rooms?: MeetingRoom[]; error?: string }> {
  try {
    const filters: any[] = [
      { op: 'eq', column: 'property_id', value: propertyId },
    ];
    if (status) filters.push({ op: 'eq', column: 'status', value: status });

    const { data, error } = await serverApi.query<MeetingRoom[]>({
      table: 'meeting_rooms',
      action: 'select',
      select: '*',
      filters,
      orders: [{ column: 'created_at', ascending: false }],
    });

    if (error) throw new Error(error.message);
    return { rooms: (data ?? []) as MeetingRoom[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomBookings(propertyId: string, status?: string): Promise<{ bookings?: MeetingRoomBooking[]; error?: string }> {
  try {
    const filters: any[] = [
      { op: 'eq', column: 'property_id', value: propertyId },
    ];
    if (status) filters.push({ op: 'eq', column: 'status', value: status });

    const { data, error } = await serverApi.query<MeetingRoomBooking[]>({
      table: 'meeting_room_bookings',
      action: 'select',
      select: '*, meeting_room:meeting_room_id(name, photo_url, location), tenant:user_id(full_name, email)',
      filters,
      orders: [{ column: 'booking_date', ascending: false }],
    });

    if (error) throw new Error(error.message);
    return { bookings: (data ?? []) as MeetingRoomBooking[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomCredits(propertyId: string): Promise<{ credit?: MeetingRoomCredit | null; company?: any | null; error?: string }> {
  try {
    const userId = await getCurrentUserId();

    let creditData: MeetingRoomCredit | null = null;
    let companyData: any | null = null;

    if (userId) {
      const { data: credit } = await serverApi.query<MeetingRoomCredit>({
        table: 'meeting_room_credits',
        action: 'select',
        select: '*',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'user_id', value: userId },
        ],
        maybeSingle: true,
      });

      if (credit) {
        creditData = credit as MeetingRoomCredit;

        // Fetch associated company if credit has company_id
        if ((credit as any).company_id) {
          const { data: company } = await serverApi.query<any>({
            table: 'companies',
            action: 'select',
            select: '*',
            filters: [{ op: 'eq', column: 'id', value: (credit as any).company_id }],
            maybeSingle: true,
          });
          companyData = company ?? null;
        }
      }
    }

    return { credit: creditData, company: companyData };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateBookingInput {
  meetingRoomId: string;
  propertyId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function createMeetingRoomBooking(input: CreateBookingInput): Promise<{ success?: boolean; booking?: MeetingRoomBooking; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await serverApi.query<MeetingRoomBooking>({
      table: 'meeting_room_bookings',
      action: 'insert',
      values: {
        meeting_room_id: input.meetingRoomId,
        property_id: input.propertyId,
        user_id: userId,
        booking_date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
        status: 'confirmed',
      },
      select: '*, meeting_room:meeting_room_id(name, photo_url, location), tenant:user_id(full_name, email)',
      single: true,
    });

    if (error) throw new Error(error.message);
    return { success: true, booking: data as MeetingRoomBooking };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function cancelMeetingRoomBookingApi(bookingId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const { error } = await serverApi.query<unknown>({
      table: 'meeting_room_bookings',
      action: 'update',
      values: { status: 'cancelled' },
      filters: [{ op: 'eq', column: 'id', value: bookingId }],
    });

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateMeetingRoomInput {
  name: string;
  propertyId: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  photo_url?: string;
  status?: string;
}

export async function createMeetingRoomApi(input: CreateMeetingRoomInput): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await serverApi.query<MeetingRoom>({
      table: 'meeting_rooms',
      action: 'insert',
      values: {
        name: input.name,
        property_id: input.propertyId,
        location: input.location ?? null,
        capacity: input.capacity,
        size: input.size ?? null,
        amenities: input.amenities ?? [],
        photo_url: input.photo_url ?? null,
        status: input.status ?? 'active',
        created_by: userId ?? null,
      },
      select: '*',
      single: true,
    });

    if (error) throw new Error(error.message);
    return { success: true, room: data as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateMeetingRoomApi(id: string, input: Partial<CreateMeetingRoomInput>): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {};
    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.location !== undefined) updatePayload.location = input.location;
    if (input.capacity !== undefined) updatePayload.capacity = input.capacity;
    if (input.size !== undefined) updatePayload.size = input.size;
    if (input.amenities !== undefined) updatePayload.amenities = input.amenities;
    if (input.photo_url !== undefined) updatePayload.photo_url = input.photo_url;
    if (input.status !== undefined) updatePayload.status = input.status;

    const { data, error } = await serverApi.query<MeetingRoom>({
      table: 'meeting_rooms',
      action: 'update',
      values: updatePayload,
      filters: [{ op: 'eq', column: 'id', value: id }],
      select: '*',
      single: true,
    });

    if (error) throw new Error(error.message);
    return { success: true, room: data as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteMeetingRoomApi(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const { error } = await serverApi.query<unknown>({
      table: 'meeting_rooms',
      action: 'update',
      values: { status: 'inactive' },
      filters: [{ op: 'eq', column: 'id', value: id }],
    });

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function uploadMeetingRoomPhoto(photoUri: string): Promise<{ success?: boolean; url?: string; error?: string }> {
  try {
    const filename = photoUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const ext = match ? match[1] : 'jpg';
    const type = `image/${ext}`;

    const fileRes = await fetch(photoUri);
    const blob = await fileRes.blob();
    const path = `${Date.now()}.${ext}`;

    const { error: uploadError } = await serverApi.upload('meeting-rooms', path, blob, type);

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = await serverApi.getPublicUrl('meeting-rooms', path);

    return { success: true, url: urlData?.publicUrl ?? '' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Additional admin helpers
// ---------------------------------------------------------------------------

export async function updateMeetingRoomCreditsApi(payload: any): Promise<{ success?: boolean; credit?: any; error?: string }> {
  try {
    // Upsert credits record — conflict on property_id + user_id (or company_id)
    const { data, error } = await serverApi.query<any>({
      table: 'meeting_room_credits',
      action: 'upsert',
      values: payload,
      mutationOptions: { onConflict: payload.company_id ? 'property_id,company_id' : 'property_id,user_id' },
      select: '*',
      single: true,
    });

    if (error) throw new Error(error.message);
    return { success: true, credit: data };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getCompaniesWithCreditsApi(propertyId: string): Promise<{ companies?: any[]; error?: string }> {
  try {
    const { data, error } = await serverApi.query<any[]>({
      table: 'companies',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      orders: [{ column: 'name', ascending: true }],
    });

    if (error) throw new Error(error.message);
    return { companies: data ?? [] };
  } catch (err: any) {
    return { error: err.message };
  }
}
