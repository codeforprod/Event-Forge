"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var InboxOutboxModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxOutboxModule = void 0;
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
const common_1 = require("@nestjs/common");
const inbox_outbox_constants_1 = require("./inbox-outbox.constants");
let InboxOutboxModule = InboxOutboxModule_1 = class InboxOutboxModule {
    static forRoot(options) {
        const providers = this.createProviders(options);
        return {
            module: InboxOutboxModule_1,
            providers,
            exports: [inbox_outbox_constants_1.OUTBOX_SERVICE, inbox_outbox_constants_1.INBOX_SERVICE, inbox_outbox_constants_1.OUTBOX_REPOSITORY, inbox_outbox_constants_1.INBOX_REPOSITORY],
            global: true,
        };
    }
    static forRootAsync(options) {
        const asyncProviders = this.createAsyncProviders(options);
        return {
            module: InboxOutboxModule_1,
            imports: options.imports || [],
            providers: [
                ...asyncProviders,
                ...this.createDynamicProviders(),
            ],
            exports: [inbox_outbox_constants_1.OUTBOX_SERVICE, inbox_outbox_constants_1.INBOX_SERVICE, inbox_outbox_constants_1.OUTBOX_REPOSITORY, inbox_outbox_constants_1.INBOX_REPOSITORY],
            global: true,
        };
    }
    static createProviders(options) {
        const providers = [];
        providers.push({
            provide: inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS,
            useValue: options,
        });
        if (options.outbox?.repository) {
            if (this.isType(options.outbox.repository)) {
                providers.push({
                    provide: inbox_outbox_constants_1.OUTBOX_REPOSITORY,
                    useClass: options.outbox.repository,
                });
            }
            else {
                providers.push({
                    provide: inbox_outbox_constants_1.OUTBOX_REPOSITORY,
                    useValue: options.outbox.repository,
                });
            }
        }
        if (options.inbox?.repository) {
            if (this.isType(options.inbox.repository)) {
                providers.push({
                    provide: inbox_outbox_constants_1.INBOX_REPOSITORY,
                    useClass: options.inbox.repository,
                });
            }
            else {
                providers.push({
                    provide: inbox_outbox_constants_1.INBOX_REPOSITORY,
                    useValue: options.inbox.repository,
                });
            }
        }
        if (options.publisher) {
            if (this.isType(options.publisher)) {
                providers.push({
                    provide: inbox_outbox_constants_1.MESSAGE_PUBLISHER,
                    useClass: options.publisher,
                });
            }
            else {
                providers.push({
                    provide: inbox_outbox_constants_1.MESSAGE_PUBLISHER,
                    useValue: options.publisher,
                });
            }
        }
        if (options.outbox) {
            providers.push({
                provide: inbox_outbox_constants_1.OUTBOX_SERVICE,
                useFactory: (repository, publisher, opts) => {
                    return new inbox_outbox_core_1.OutboxService(repository, publisher, opts.outbox?.config);
                },
                inject: [inbox_outbox_constants_1.OUTBOX_REPOSITORY, inbox_outbox_constants_1.MESSAGE_PUBLISHER, inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            });
        }
        if (options.inbox) {
            providers.push({
                provide: inbox_outbox_constants_1.INBOX_SERVICE,
                useFactory: (repository, opts) => {
                    return new inbox_outbox_core_1.InboxService(repository, opts.inbox?.config);
                },
                inject: [inbox_outbox_constants_1.INBOX_REPOSITORY, inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            });
        }
        return providers;
    }
    static createAsyncProviders(options) {
        if (options.useExisting || options.useFactory) {
            return [this.createAsyncOptionsProvider(options)];
        }
        if (options.useClass) {
            return [
                this.createAsyncOptionsProvider(options),
                {
                    provide: options.useClass,
                    useClass: options.useClass,
                },
            ];
        }
        return [];
    }
    static createAsyncOptionsProvider(options) {
        if (options.useFactory) {
            return {
                provide: inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS,
                useFactory: options.useFactory,
                inject: (options.inject || []),
            };
        }
        if (options.useExisting) {
            return {
                provide: inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS,
                useFactory: async (optionsFactory) => optionsFactory.createInboxOutboxOptions(),
                inject: [options.useExisting],
            };
        }
        if (options.useClass) {
            return {
                provide: inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS,
                useFactory: async (optionsFactory) => optionsFactory.createInboxOutboxOptions(),
                inject: [options.useClass],
            };
        }
        throw new Error('Invalid async configuration');
    }
    static createDynamicProviders() {
        return [
            {
                provide: inbox_outbox_constants_1.OUTBOX_REPOSITORY,
                useFactory: (options) => {
                    if (!options.outbox?.repository) {
                        return null;
                    }
                    if (this.isType(options.outbox.repository)) {
                        const RepositoryClass = options.outbox.repository;
                        return new RepositoryClass();
                    }
                    return options.outbox.repository;
                },
                inject: [inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            },
            {
                provide: inbox_outbox_constants_1.INBOX_REPOSITORY,
                useFactory: (options) => {
                    if (!options.inbox?.repository) {
                        return null;
                    }
                    if (this.isType(options.inbox.repository)) {
                        const RepositoryClass = options.inbox.repository;
                        return new RepositoryClass();
                    }
                    return options.inbox.repository;
                },
                inject: [inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            },
            {
                provide: inbox_outbox_constants_1.MESSAGE_PUBLISHER,
                useFactory: (options) => {
                    if (!options.publisher) {
                        return null;
                    }
                    if (this.isType(options.publisher)) {
                        const PublisherClass = options.publisher;
                        return new PublisherClass();
                    }
                    return options.publisher;
                },
                inject: [inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            },
            {
                provide: inbox_outbox_constants_1.OUTBOX_SERVICE,
                useFactory: (repository, publisher, options) => {
                    if (!repository || !publisher) {
                        return null;
                    }
                    return new inbox_outbox_core_1.OutboxService(repository, publisher, options.outbox?.config);
                },
                inject: [inbox_outbox_constants_1.OUTBOX_REPOSITORY, inbox_outbox_constants_1.MESSAGE_PUBLISHER, inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            },
            {
                provide: inbox_outbox_constants_1.INBOX_SERVICE,
                useFactory: (repository, options) => {
                    if (!repository) {
                        return null;
                    }
                    return new inbox_outbox_core_1.InboxService(repository, options.inbox?.config);
                },
                inject: [inbox_outbox_constants_1.INBOX_REPOSITORY, inbox_outbox_constants_1.INBOX_OUTBOX_OPTIONS],
            },
        ];
    }
    static isType(value) {
        return typeof value === 'function';
    }
};
exports.InboxOutboxModule = InboxOutboxModule;
exports.InboxOutboxModule = InboxOutboxModule = InboxOutboxModule_1 = __decorate([
    (0, common_1.Module)({})
], InboxOutboxModule);
//# sourceMappingURL=inbox-outbox.module.js.map