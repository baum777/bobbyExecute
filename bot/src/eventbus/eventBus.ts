/**
 * Typed EventBus with Zod validation.
 * Async handler registry with error isolation.
 */
import type { PipelineEvent } from "./events.js";
import {
  IntentCreatedEventSchema,
  DecisionMadeEventSchema,
  TradeExecutedEventSchema,
  JournalEntryRecordedEventSchema,
  StageTransitionEventSchema,
} from "./events.js";

type EventType = PipelineEvent["type"];

type Handler<T extends PipelineEvent> = (event: T) => Promise<void>;

const schemas = {
  IntentCreated: IntentCreatedEventSchema,
  DecisionMade: DecisionMadeEventSchema,
  TradeExecuted: TradeExecutedEventSchema,
  JournalEntryRecorded: JournalEntryRecordedEventSchema,
  StageTransition: StageTransitionEventSchema,
} as const;

export interface EventBusConfig {
  validate?: boolean;
  onHandlerError?: (eventType: string, err: unknown) => void;
}

export class EventBus {
  private handlers = new Map<EventType, Array<Handler<PipelineEvent>>>();
  private readonly validate: boolean;
  private readonly onHandlerError: (eventType: string, err: unknown) => void;

  constructor(config: EventBusConfig = {}) {
    this.validate = config.validate ?? true;
    this.onHandlerError =
      config.onHandlerError ??
      ((type, err) => {
        console.error(`[EventBus] Handler error for ${type}:`, err);
      });
  }

  on<T extends EventType>(
    eventType: T,
    handler: Handler<Extract<PipelineEvent, { type: T }>>
  ): () => void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as Handler<PipelineEvent>);
    this.handlers.set(eventType, list);

    return () => {
      const idx = list.indexOf(handler as Handler<PipelineEvent>);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  async emit(event: PipelineEvent): Promise<void> {
    if (this.validate) {
      const schema = schemas[event.type as EventType];
      if (schema) {
        const parsed = schema.safeParse(event);
        if (!parsed.success) {
          throw new Error(
            `Event validation failed for ${event.type}: ${parsed.error.message}`
          );
        }
        event = parsed.data as PipelineEvent;
      }
    }

    const list = this.handlers.get(event.type as EventType) ?? [];
    const promises = list.map(async (h) => {
      try {
        await h(event);
      } catch (err) {
        this.onHandlerError(event.type, err);
      }
    });

    await Promise.all(promises);
  }

  /** Emit and swallow handler errors (fire-and-forget). */
  emitSafe(event: PipelineEvent): void {
    this.emit(event).catch((err) => {
      if (this.onHandlerError) this.onHandlerError("emit", err);
    });
  }
}
