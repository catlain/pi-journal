/**
 * journal 扩展 — 时间范围解析
 *
 * 支持格式: 1d, 3d, 1w, 1h, 30m, today, yesterday, YYYY-MM-DD, ISO 时间戳
 * 无参数时默认 1d
 */

export interface TimeRange {
	since: string;
	until: string;
}

const DURATION_RE = /^(\d+)([mhdw])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toLocalISO(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d;
}

/**
 * 解析时间范围字符串，返回 ISO 时间戳对
 * @param input 时间范围描述
 * @returns TimeRange 或 null（无效输入）
 */
export function parseTimeRange(input?: string): TimeRange | null {
	const now = new Date();

	// 空字符串或未定义 → 默认 1d
	if (!input) {
		if (input === "") return null; // 空字符串返回 null
		const since = new Date(Date.now() - 86400000);
		return { since: toLocalISO(since), until: toLocalISO(now) };
	}

	// today
	if (input === "today") {
		return { since: toLocalISO(startOfDay(now)), until: toLocalISO(endOfDay(now)) };
	}

	// yesterday
	if (input === "yesterday") {
		const yd = new Date(now);
		yd.setDate(yd.getDate() - 1);
		return { since: toLocalISO(startOfDay(yd)), until: toLocalISO(endOfDay(yd)) };
	}

	// this_week
	if (input === "this_week") {
		const dayOfWeek = now.getDay(); // 0=Sun
		const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		const monday = new Date(now);
		monday.setDate(now.getDate() + mondayOffset);
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		return { since: toLocalISO(startOfDay(monday)), until: toLocalISO(endOfDay(sunday)) };
	}

	// 持续时间: 30m, 1h, 1d, 3d, 1w
	const durMatch = DURATION_RE.exec(input);
	if (durMatch) {
		const amount = parseInt(durMatch[1], 10);
		const unit = durMatch[2];
		let ms: number;
		switch (unit) {
			case "m":
				ms = amount * 60_000;
				break;
			case "h":
				ms = amount * 3_600_000;
				break;
			case "d":
				ms = amount * 86_400_000;
				break;
			case "w":
				ms = amount * 604_800_000;
				break;
			default:
				return null;
		}
		return { since: toLocalISO(new Date(now.getTime() - ms)), until: toLocalISO(now) };
	}

	// YYYY-MM-DD
	const dateMatch = DATE_RE.exec(input);
	if (dateMatch) {
		const d = new Date(input + "T00:00:00");
		if (isNaN(d.getTime())) return null;
		return { since: toLocalISO(startOfDay(d)), until: toLocalISO(endOfDay(d)) };
	}

	// ISO 时间戳直接作为 since（精确时间点，since == until）
	if (input.includes("T")) {
		const d = new Date(input);
		if (!isNaN(d.getTime())) {
			return { since: toLocalISO(d), until: toLocalISO(d) };
		}
	}

	return null;
}
