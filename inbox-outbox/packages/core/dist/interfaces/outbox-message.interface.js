"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxMessageStatus = void 0;
var OutboxMessageStatus;
(function (OutboxMessageStatus) {
    OutboxMessageStatus["PENDING"] = "pending";
    OutboxMessageStatus["PROCESSING"] = "processing";
    OutboxMessageStatus["PUBLISHED"] = "published";
    OutboxMessageStatus["FAILED"] = "failed";
    OutboxMessageStatus["PERMANENTLY_FAILED"] = "permanently_failed";
})(OutboxMessageStatus || (exports.OutboxMessageStatus = OutboxMessageStatus = {}));
//# sourceMappingURL=outbox-message.interface.js.map