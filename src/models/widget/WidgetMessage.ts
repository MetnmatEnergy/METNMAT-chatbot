import mongoose from 'mongoose';
import { SenderType, MessageType } from '../../types/widget-types';

const widgetMessageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'WidgetConversation', required: true },
    sender: { type: String, enum: Object.values(SenderType), required: true },
    type: { type: String, enum: Object.values(MessageType), required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
});

export const WidgetMessage = mongoose.model('WidgetMessage', widgetMessageSchema);
