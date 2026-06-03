import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin lazily
function getFirebaseAdmin() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.warn('Firebase env vars missing. Initialization skipped.');
      return admin;
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
      }),
    });
  }
  return admin;
}

/**
 * POST /api/notifications/test
 * Send a test push notification to the current user's device(s) via FCM v1 API.
 * Body: { title?: string, body?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const title = body.title || 'Test Notification';
    const messageBody = body.body || 'This is a test push from Autopilot';

    // Get user's active push tokens
    const supabaseAdmin = createAdminClient();
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', auth.user.id)
      .eq('is_active', true);

    if (tokenError) {
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
    }

    if (!tokens?.length) {
      return NextResponse.json({ error: 'No active push tokens found for this user' }, { status: 404 });
    }

    // Send to all user's devices via FCM v1
    const results = await Promise.allSettled(
      tokens.map(async (t: any) => {
        const message: admin.messaging.Message = {
          token: t.token,
          notification: {
            title,
            body: messageBody,
          },
          data: {
            type: 'test',
            timestamp: new Date().toISOString(),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'default',
            },
          },
        };

        try {
          const app = getFirebaseAdmin();
          if (!process.env.FIREBASE_PROJECT_ID) throw new Error('Firebase not configured');
          const response = await app.messaging().send(message);
          return { token: t.token.slice(0, 20) + '...', success: true, messageId: response };
        } catch (sendErr: any) {
          // Mark invalid tokens as inactive
          if (
            sendErr.code === 'messaging/invalid-registration-token' ||
            sendErr.code === 'messaging/registration-token-not-registered'
          ) {
            await supabaseAdmin
              .from('push_tokens')
              .update({ is_active: false })
              .eq('token', t.token);
          }
          return { token: t.token.slice(0, 20) + '...', success: false, error: sendErr.message, code: sendErr.code };
        }
      })
    );

    const successful = results.filter((r: any) => r.value?.success);
    const failed = results.filter((r: any) => !r.value?.success);

    return NextResponse.json({
      success: successful.length > 0,
      sentTo: successful.length,
      failed: failed.length,
      totalDevices: tokens.length,
      results: results.map((r: any) => r.value),
    });
  } catch (error: any) {
    console.error('[saas-mobile-server] Test notification error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
