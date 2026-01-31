-- Rename avg_claude_duration_sec to avg_ai_duration_sec
ALTER TABLE project_metrics_summary 
RENAME COLUMN avg_claude_duration_sec TO avg_ai_duration_sec;