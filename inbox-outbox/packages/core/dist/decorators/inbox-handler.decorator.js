"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INBOX_HANDLER_METADATA = void 0;
exports.InboxHandler = InboxHandler;
require("reflect-metadata");
exports.INBOX_HANDLER_METADATA = 'inbox-outbox:inbox-handler';
function InboxHandler(options) {
    return (_target, _propertyKey, descriptor) => {
        Reflect.defineMetadata(exports.INBOX_HANDLER_METADATA, options, descriptor.value);
        return descriptor;
    };
}
//# sourceMappingURL=inbox-handler.decorator.js.map