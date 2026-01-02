export interface Content {
  id: number;
  name: string;
  url: string;
  description?: string;
  requiresInteraction: boolean;
  thumbnailUrl?: string;
  defaultDuration?: number; // Duration in seconds
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContentDto {
  name: string;
  url: string;
  description?: string;
  requiresInteraction?: boolean;
  thumbnailUrl?: string;
}

export interface UpdateContentDto {
  name?: string;
  url?: string;
  description?: string;
  requiresInteraction?: boolean;
  thumbnailUrl?: string;
}
