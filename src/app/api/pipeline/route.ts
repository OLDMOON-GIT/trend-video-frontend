import { NextResponse } from "next/server";

import type { VideoItem } from "@/types/video";

export type PipelineModel = "gpt" | "gemini" | "claude" | "groq";

type PipelineRequest = {
  videos?: Array<
    Pick<
      VideoItem,
      | "id"
      | "title"
      | "channelName"
      | "channelSubscribers"
      | "views"
      | "likes"
      | "comments"
      | "duration"
      | "publishedAt"
      | "videoUrl"
      | "categoryId"
      | "durationSeconds"
    >
  >;
  model?: PipelineModel;
};

type PipelineResponseItem = {
  id: string;
  title: string;
  channelName: string;
  views: number;
  videoUrl: string;
  script: string;
  transcript?: string;
  funHighlights?: string[];
  thumbnailPrompt?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PipelineRequest;
  const videos = Array.isArray(body.videos) ? body.videos : [];

  if (!videos.length) {
    return NextResponse.json(
      { error: "선택된 영상 정보가 없습니다." },
      { status: 400 }
    );
  }

  const model = body.model ?? "gpt";
  const results: PipelineResponseItem[] = [];

  for (const video of videos) {
    const videoId = extractVideoId(video.videoUrl ?? "");
    const transcript = videoId ? await fetchTranscript(videoId) : null;
    const generation = generateNarrative({ video: video as any, transcript, model });

    results.push({
      id: video.id,
      title: video.title,
      channelName: video.channelName,
      views: Number(video.views ?? 0),
      videoUrl: video.videoUrl,
      transcript: transcript ?? undefined,
      script: generation.script,
      funHighlights: generation.funHighlights,
      thumbnailPrompt: generation.thumbnailPrompt,
    });
  }

  return NextResponse.json({ results, model });
}

async function fetchTranscript(videoId: string) {
  const languages = ["ko", "en", "en-US", "ja", "zh-Hans", "zh-Hant"];

  for (const lang of languages) {
    const url = `https://video.google.com/timedtext?lang=${lang}&v=${videoId}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const xml = await response.text();
      if (!xml.trim()) {
        continue;
      }
      const text = parseTranscriptXml(xml);
      if (text) {
        return text;
      }
    } catch (error) {
      console.error("Transcript fetch failed", error);
    }
  }

  return null;
}

function parseTranscriptXml(xml: string) {
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(xml))) {
    const content = match[1];
    const decoded = decodeHtmlEntities(content.replace(/\n/g, " "));
    if (decoded.trim()) {
      parts.push(decoded.trim());
    }
  }
  return parts.length ? parts.join(" ") : null;
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, "'");
}

function extractVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace(/\//g, "");
    }
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
  } catch (error) {
    console.warn("Failed to parse video id", error);
  }
  return null;
}

function generateNarrative({
  video,
  transcript,
  model,
}: {
  video: any;
  transcript: string | null;
  model: PipelineModel;
}) {
  const categoryLabel = mapCategory(video.categoryId ?? "");
  const cleanTranscript = transcript ? transcript.replace(/\s+/g, " ").trim() : "";
  const sentences = cleanTranscript
    ? cleanTranscript.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0)
    : [];

  const hook = sentences[0]?.slice(0, 160) ?? `${video.title ?? "Unknown title"} remix intro.`;
  const mid = sentences.slice(1, 3).join(" ") || "Highlight the most exciting beats and visuals.";
  const outro = sentences[3]?.slice(0, 160) ?? "Close with an energetic CTA inviting viewers to share and remix.";

  const script = [
    `Selected model: ${model.toUpperCase()}`,
    `🎬 Hook: ${hook}`,
    `🎵 Body: ${mid}`,
    `🚀 Outro: ${outro}`,
  ].join('\n\n');

  const funHighlights = sentences.slice(0, 3).map((line, index) => `${index + 1}. ${line.slice(0, 120)}`);

  const thumbnailPrompt = [
    "Vibrant vertical remix frame",
    `Key text: "${(video.title ?? "Remix").slice(0, 30)}"`,
    `Category accent: ${categoryLabel}` ,
    "Dynamic beat-synced typography",
    "Trending emoji accents",
  ].join(' | ');

  return {
    script,
    funHighlights: funHighlights.length ? funHighlights : undefined,
    thumbnailPrompt,
  };
}


function mapCategory(categoryId: string) {
  const categories: Record<string, string> = {
    '1': 'Film & Animation',
    '2': 'Autos & Vehicles',
    '10': 'Music',
    '17': 'Sports',
    '20': 'Gaming',
    '22': 'People & Blogs',
    '23': 'Comedy',
    '24': 'Entertainment',
    '25': 'News & Politics',
    '26': 'Education',
    '27': 'Science & Technology',
    '28': 'DIY & Lifestyle',
  };
  return categories[categoryId ?? ''] ?? 'Other';
}
