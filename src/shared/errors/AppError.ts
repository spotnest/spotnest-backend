export class AppError extends Error {
    statusCode: number;

    /**
     * Optional machine-readable code.
     *
     * The frontend keys off `response.data.code` to decide whether to show
     * a recovery affordance (e.g. LISTING_LIMIT_REACHED -> upgrade modal).
     * Messages are for humans and may be reworded; codes are a stable contract.
     */
    code?: string;

    constructor(statusCode: number, message: string, code?: string) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;

        if (code) {
            this.code = code;
        }
    }
}
