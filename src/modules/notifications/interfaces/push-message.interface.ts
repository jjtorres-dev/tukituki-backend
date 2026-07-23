export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushSendResult =
  | { kind: 'sent'; messageId: string }
  | { kind: 'skipped' }
  | { kind: 'failed'; error: string; invalidToken: boolean };
