"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTBOX_HANDLER_METADATA = void 0;
exports.OutboxHandler = OutboxHandler;
require("reflect-metadata");
exports.OUTBOX_HANDLER_METADATA = 'inbox-outbox:outbox-handler';
function OutboxHandler(options) {
    return (_target, _propertyKey, descriptor) => {
        Reflect.defineMetadata(exports.OUTBOX_HANDLER_METADATA, options, descriptor.value);
        return descriptor;
    };
}
//# sourceMappingURL=outbox-handler.decorator.js.map