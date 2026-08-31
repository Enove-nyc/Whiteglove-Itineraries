// An advisor's short welcome video on a trip — pure data model + pure
// rules. The file itself is stored the same way a companion-chat video is
// (lib/media.ts, served from /api/media by its own unguessable id); this is
// only the small record that says which media id belongs to which trip.

export const WELCOME_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export type WelcomeVideoType = (typeof WELCOME_VIDEO_TYPES)[number];

export function isWelcomeVideoType(value: string): value is WelcomeVideoType {
  return (WELCOME_VIDEO_TYPES as readonly string[]).includes(value);
}

export const MAX_WELCOME_CAPTION = 200;

export type AdvisorWelcome = {
  mediaId: string;
  contentType: string;
  /** "Looking forward to Rome!" — shown under the video. Optional. */
  caption?: string;
  uploadedAt: string;
};

/** Why a caption cannot be saved, or null. */
export function captionProblem(caption: string | undefined): string | null {
  if ((caption?.length ?? 0) > MAX_WELCOME_CAPTION) {
    return `Keep the caption under ${MAX_WELCOME_CAPTION} characters.`;
  }
  return null;
}
