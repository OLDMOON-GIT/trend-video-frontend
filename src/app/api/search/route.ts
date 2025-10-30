import { NextResponse } from "next/server";

import type { DateFilter, SortOption, VideoItem, VideoType } from "@/types/video";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const DEFAULT_QUERY = "korea trending";
const MAX_RESULTS = 24;

export async function POST(request: Request) {
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "Missing YOUTUBE_API_KEY environment variable" },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Partial<{
    videoType: VideoType | "all";
    dateFilter: DateFilter;
    sortBy: SortOption;
    viewRange: { min: number; max: number };
    subRange: { min: number; max: number };
    query: string;
    categoryIds: string[];
    titleQuery: string;
    durationRangeSeconds: { min: number; max: number };
  }>;

  const videoType = body.videoType ?? "all";
  const dateFilter = body.dateFilter ?? "any";
  const sortBy = body.sortBy ?? "views";
  const viewRange = body.viewRange ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
  const subRange = body.subRange ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
  const durationRange = body.durationRangeSeconds ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
  const categoryIds = Array.isArray(body.categoryIds)
    ? body.categoryIds.filter((value): value is string => Boolean(value))
    : [];
  const categoryFilter = new Set(categoryIds);
  const query = body.query?.trim() || DEFAULT_QUERY;
  const titleQuery = body.titleQuery?.trim() ?? "";

  try {
    const searchParams = buildSearchParams({
      query,
      videoType,
      dateFilter,
      sortBy,
    });

    const searchUrl = `${YOUTUBE_API_BASE}/search?${searchParams.toString()}`;
    const searchResponse = await fetch(searchUrl, {
      cache: "no-store",
    });

    if (!searchResponse.ok) {
      const message = await extractError(searchResponse);
      return NextResponse.json({ error: message }, { status: searchResponse.status });
    }

    const searchData = (await searchResponse.json()) as YoutubeSearchResponse;
    const videoIds = searchData.items
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (!videoIds.length) {
      return NextResponse.json({ videos: [] });
    }

    const videosResponse = await fetch(
      `${YOUTUBE_API_BASE}/videos?${new URLSearchParams({
        key: process.env.YOUTUBE_API_KEY,
        part: "snippet,statistics,contentDetails",
        id: videoIds.join(","),
      }).toString()}`,
      { cache: "no-store" }
    );

    if (!videosResponse.ok) {
      const message = await extractError(videosResponse);
      return NextResponse.json({ error: message }, { status: videosResponse.status });
    }

    const videosData = (await videosResponse.json()) as YoutubeVideosResponse;

    const channelIds = Array.from(
      new Set(
        videosData.items
          .map((item) => item.snippet?.channelId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const channelStatsMap = await fetchChannelStats(channelIds);

    const videos = videosData.items
      .map((item): VideoItem | null => {
        const snippet = item.snippet;
        const statistics = item.statistics;
        if (!snippet || !statistics) {
          return null;
        }

        const viewCount = Number(statistics.viewCount ?? 0);
        const likeCount = Number(statistics.likeCount ?? 0);
        const commentCount = Number(statistics.commentCount ?? 0);
        const subscriberCount = channelStatsMap.get(snippet.channelId ?? "") ?? 0;

        if (
          viewCount < viewRange.min ||
          viewCount > viewRange.max ||
          subscriberCount < subRange.min ||
          subscriberCount > subRange.max
        ) {
          return null;
        }

        const detectedType = determineVideoType({
          snippet,
          contentDetails: item.contentDetails,
        });

        if (videoType !== "all" && detectedType !== videoType) {
          return null;
        }

        if (!matchesDateFilter(snippet.publishedAt, dateFilter)) {
          return null;
        }

        if (categoryFilter.size && (!snippet.categoryId || !categoryFilter.has(snippet.categoryId))) {
          return null;
        }

        if (titleQuery && !(snippet.title ?? "").toLowerCase().includes(titleQuery.toLowerCase())) {
          return null;
        }

        const videoDurationSeconds = parseIsoDuration(item.contentDetails?.duration ?? "");
        if (videoDurationSeconds < durationRange.min || videoDurationSeconds > durationRange.max) {
          return null;
        }

        const durationLabel =
          detectedType === "live"
            ? "LIVE"
            : formatDuration(item.contentDetails?.duration);

        return {
          id: item.id ?? snippet.title,
          title: snippet.title ?? "Untitled video",
          thumbnailUrl:
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.default?.url ||
            "",
          channelName: snippet.channelTitle ?? "Unknown Channel",
          channelSubscribers: subscriberCount,
          type: detectedType,
          views: viewCount,
          likes: likeCount,
          comments: commentCount,
          duration: durationLabel,
          publishedAt: snippet.publishedAt ?? new Date().toISOString(),
          videoUrl: `https://www.youtube.com/watch?v=${item.id ?? ""}`,
          categoryId: snippet.categoryId,
          durationSeconds: videoDurationSeconds,
        } satisfies VideoItem;
      })
      .filter((item): item is VideoItem => Boolean(item));

    const sortedVideos = sortVideos(videos, sortBy);

    return NextResponse.json({ videos: sortedVideos });
  } catch (error) {
    console.error("YouTube API pipeline failed", error);
    return NextResponse.json({ error: "YouTube API request failed" }, { status: 500 });
  }
}

type YoutubeSearchResponse = {
  items: Array<{
    id?: { videoId?: string };
    snippet?: YoutubeSnippet;
  }>;
};

type YoutubeVideosResponse = {
  items: Array<{
    id?: string;
    snippet?: YoutubeSnippet;
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
};

type YoutubeSnippet = {
  title?: string;
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  liveBroadcastContent?: string;
  thumbnails?: {
    default?: { url?: string };
    medium?: { url?: string };
    high?: { url?: string };
  };
};

function buildSearchParams({
  query,
  videoType,
  dateFilter,
  sortBy,
}: {
  query: string;
  videoType: VideoType | "all";
  dateFilter: DateFilter;
  sortBy: SortOption;
}) {
  const params = new URLSearchParams({
    key: process.env.YOUTUBE_API_KEY!,
    part: "snippet",
    maxResults: String(MAX_RESULTS),
    q: query,
    type: "video",
  });

  const orderMap: Record<SortOption, string> = {
    views: "viewCount",
    recent: "date",
    vph: "viewCount",
  };

  params.set("order", orderMap[sortBy]);
  params.set("regionCode", "KR");
  params.set("relevanceLanguage", "ko");

  if (videoType === "live") {
    params.set("eventType", "live");
  } else if (videoType === "shorts") {
    params.set("videoDuration", "short");
  } else {
    params.set("videoDuration", "any");
  }

  const publishedAfter = calculatePublishedAfter(dateFilter);
  if (publishedAfter) {
    params.set("publishedAfter", publishedAfter);
  }

  return params;
}

async function fetchChannelStats(channelIds: string[]) {
  const stats = new Map<string, number>();
  if (!channelIds.length) {
    return stats;
  }

  const channelResponse = await fetch(
    `${YOUTUBE_API_BASE}/channels?${new URLSearchParams({
      key: process.env.YOUTUBE_API_KEY!,
      part: "statistics",
      id: channelIds.join(","),
    }).toString()}`,
    { cache: "no-store" }
  );

  if (!channelResponse.ok) {
    return stats;
  }

  const data = (await channelResponse.json()) as {
    items?: Array<{ id?: string; statistics?: { subscriberCount?: string } }>;
  };

  data.items?.forEach((item) => {
    if (!item.id) return;
    const subscriberCount = Number(item.statistics?.subscriberCount ?? 0);
    stats.set(item.id, subscriberCount);
  });

  return stats;
}

function determineVideoType({
  snippet,
  contentDetails,
}: {
  snippet?: YoutubeSnippet;
  contentDetails?: { duration?: string };
}): VideoType {
  if (snippet?.liveBroadcastContent === "live") {
    return "live";
  }

  const durationSeconds = parseIsoDuration(contentDetails?.duration ?? "");
  if (durationSeconds <= 60) {
    return "shorts";
  }

  return "video";
}

function formatDuration(duration?: string) {
  const totalSeconds = parseIsoDuration(duration ?? "");
  if (!totalSeconds) {
    return "0:00";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseIsoDuration(duration: string) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }
  const [, hours, minutes, seconds] = match;
  return (
    (Number(hours ?? 0) || 0) * 3600 +
    (Number(minutes ?? 0) || 0) * 60 +
    (Number(seconds ?? 0) || 0)
  );
}

function calculatePublishedAfter(filter: DateFilter) {
  const now = Date.now();
  if (filter === "today") {
    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }
  if (filter === "week") {
    return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (filter === "month") {
    return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (filter === "two_months") {
    return new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
  }
  return undefined;
}

function matchesDateFilter(publishedAt: string | undefined, filter: DateFilter) {
  if (!publishedAt || filter === "any") {
    return true;
  }
  const publishedDate = new Date(publishedAt);
  const after = calculatePublishedAfter(filter);
  if (!after) {
    return true;
  }
  return publishedDate.getTime() >= new Date(after).getTime();
}

function sortVideos(videos: VideoItem[], sortBy: SortOption) {
  if (sortBy === "recent") {
    return [...videos].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  if (sortBy === "views") {
    return [...videos].sort((a, b) => b.views - a.views);
  }

  if (sortBy === "vph") {
    return [...videos].sort((a, b) => calculateVph(b) - calculateVph(a));
  }

  return videos;
}

function calculateVph(video: VideoItem) {
  const publishedDate = new Date(video.publishedAt);
  const now = new Date();
  const diffMs = Math.max(now.getTime() - publishedDate.getTime(), 1);
  const diffHours = diffMs / (1000 * 60 * 60);
  return video.views / diffHours;
}

async function extractError(response: Response) {
  try {
    const data = await response.json();
    if (typeof data?.error?.message === "string") {
      return data.error.message;
    }
  } catch {
    // ignore json parse error
  }
  return `YouTube API error (${response.status})`;
}
