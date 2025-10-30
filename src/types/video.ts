export type VideoType = "video" | "shorts" | "live";

export type DateFilter = "today" | "week" | "month" | "two_months" | "any";

export type SortOption = "views" | "vph" | "recent";

export type VideoItem = {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelSubscribers: number;
  type: VideoType;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  publishedAt: string;
  videoUrl: string;
  categoryId?: string;
  durationSeconds?: number;
};
