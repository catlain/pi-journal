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

function toISO(date: Date): string {
	return date.toISOString();
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
	if (!input) {
		const since = new Date(Date.now() - 86400000);
		return { since: toISO(since), until: toISO(new Date()) };
	}

	const now = new Date();

	// today
	if (input === "today") {
		return { since: toISO(startOfDay(now)), until: toISO(endOfDay(now)) };
	}

	// yesterday
	if (input === "yesterday") {
		const yd = new Date(now);
		yd.setDate(yd.getDate() - 1);
		return { since: toISO(startOfDay(yd)), until: toISO(endOfDay(yd)) };
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
		return { since: toISO(new Date(now.getTime() - ms)), until: toISO(now) };
	}

	// YYYY-MM-DD
	const dateMatch = DATE_RE.exec(input);
	if (dateMatch) {
		const d = new Date(input + "T00:00:00");
		if (isNaN(d.getTime())) return null;
		return { since: toISO(startOfDay(d)), until: toISO(endOfDay(d)) };
	}

	// ISO 时间戳直接作为 since
	if (input.includes("T")) {
		const d = new Date(input);
		if (!isNaN(d.getTime())) {
			return { since: toISO(d), until: toISO(now) };
		}
	}

	return null;
}
