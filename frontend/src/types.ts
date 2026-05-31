// Types

export interface Tag {
    id: number;
    name: string;
}

export interface Session {
    id: number;
    duration_minutes: number;
    started_at: string;
    status: string;  // "in_progress", "completed", or "paused"
    paused_at: string | null;
    total_paused_seconds: number;
    tags: Tag[];
}

export interface DailyStats {
    date: string;
    minutes: number;
    sessions: number;
}

export interface Statistics {
    total_sessions: number;
    total_minutes: number;
    avg_minutes: number;
    daily: DailyStats[];
}