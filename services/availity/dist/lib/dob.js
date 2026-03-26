"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYmdToUtcDate = parseYmdToUtcDate;
exports.formatDateToYmd = formatDateToYmd;
/** Store API YYYY-MM-DD as UTC midnight for Prisma `DateTime` / Postgres `timestamp`. */
function parseYmdToUtcDate(ymd) {
    return new Date(`${ymd}T00:00:00.000Z`);
}
/** Format a UTC-stored calendar date for display (YYYY-MM-DD). */
function formatDateToYmd(d) {
    return d.toISOString().slice(0, 10);
}
//# sourceMappingURL=dob.js.map