import mongoose from 'mongoose';

const widgetConversationSchema = new mongoose.Schema({
    siteKey: { type: String, required: true },
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'WidgetVisitor', required: true },
    createdAt: { type: Date, default: Date.now },
});

export const WidgetConversation = mongoose.model('WidgetConversation', widgetConversationSchema);
