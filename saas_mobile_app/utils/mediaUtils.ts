import * as ImageManipulator from 'expo-image-manipulator';

import { File } from 'expo-file-system';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

export const decodeBase64ToArrayBuffer = (base64: string): ArrayBuffer => {
  let bufferLength = base64.length * 0.75;
  let len = base64.length;
  let i = 0;
  let p = 0;
  let encoded1, encoded2, encoded3, encoded4;

  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }

  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);

  for (i = 0; i < len; i += 4) {
    encoded1 = lookup[base64.charCodeAt(i)];
    encoded2 = lookup[base64.charCodeAt(i + 1)];
    encoded3 = lookup[base64.charCodeAt(i + 2)];
    encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return arraybuffer;
};

/**
 * Reads a local file URI and returns its contents as an ArrayBuffer.
 * This is the correct approach for React Native using Expo FileSystem
 * and Base64 decoding, as XHR fails on some Android local files.
 */
export async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    const file = new File(uri);
    const bytes = await file.bytes();
    return bytes.buffer as ArrayBuffer;
  } catch (err: any) {
    console.error('[readFileAsArrayBuffer] Error reading file:', err);
    throw new Error(`Failed to read file from ${uri}: ${err.message}`);
  }
}

/**
 * Compresses an image to be under ~1MB and limits dimensions to 1200px.
 * Returns the local URI of the compressed image.
 */
export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }], // Resize width to 1200px (keeps aspect ratio)
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } // 70% quality JPEG
    );
    return result.uri;
  } catch (err) {
    console.error('[compressImage] Error:', err);
    return uri; // Fallback to original if compression fails
  }
}

/**
 * Gets a clean, consistent path for storage.
 * Uses a FIXED filename per slot so replacements overwrite the old file directly.
 * The extension must match the ACTUAL file type being stored.
 */
export function getStoragePath(
  propertyId: string,
  ticketId: string,
  type: 'before' | 'after',
  extension: 'jpg' | 'mp4'
): string {
  return `${propertyId}/${ticketId}/${type}_${Date.now()}.${extension}`;
}

/**
 * Gets the storage path for a specific media type (photo or video) for a slot.
 * Used to find and delete the old file before uploading a replacement.
 */
export function getStoragePathForSlot(
  propertyId: string,
  ticketId: string,
  type: 'before' | 'after',
  isPhoto: boolean
): string {
  return `${propertyId}/${ticketId}/${type}.${isPhoto ? 'jpg' : 'mp4'}`;
}
