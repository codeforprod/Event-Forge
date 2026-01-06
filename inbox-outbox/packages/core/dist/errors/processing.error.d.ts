export declare class ProcessingError extends Error {
    readonly messageId: string;
    readonly eventType: string;
    readonly cause?: Error | undefined;
    constructor(message: string, messageId: string, eventType: string, cause?: Error | undefined);
}
//# sourceMappingURL=processing.error.d.ts.map