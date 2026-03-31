export type Verdict = 'SAFE' | 'WARNING' | 'DANGER' | 'BLOCK' | 'UNKNOWN';

export type VettingStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export interface VetRequest {
  url: string;
}

export interface VetChunkMessage {
  type: 'chunk';
  content: string;
}

export interface VetDoneMessage {
  type: 'done';
}

export interface VetErrorMessage {
  type: 'error';
  message: string;
}

export interface VetProgressMessage {
  type: 'progress';
  step: string;
}

export type VetSSEMessage = VetChunkMessage | VetDoneMessage | VetErrorMessage | VetProgressMessage;
