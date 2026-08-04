import mongoose from 'mongoose';
import { SenderType, MessageType } from '../../types/widget-types';

const widgetMessageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'WidgetConversation', required: true },
    sender: { type: String, enum: Object.values(SenderType), required: true },
    type: { type: String, enum: Object.values(MessageType), required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
});

/**
 * Every history load runs
 *   find({ conversation }).sort({ createdAt: 1 }).limit(200)
 * (widget-controller.ts:107-110) — once when the widget opens, and again on
 * every restore. With no index that was a full collection scan plus an
 * in-memory sort, on a collection that only grows.
 *
 * Compound, not two single-field indexes: this one serves the equality match
 * AND supplies the sort order, so Mongo neither scans nor sorts.
 */
widgetMessageSchema.index({ conversation: 1, createdAt: 1 });

export const WidgetMessage = mongoose.model('WidgetMessage', widgetMessageSchema);
