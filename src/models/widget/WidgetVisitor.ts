import mongoose from 'mongoose';

const widgetVisitorSchema = new mongoose.Schema({
    createdAt: { type: Date, default: Date.now },
});

export const WidgetVisitor = mongoose.model('WidgetVisitor', widgetVisitorSchema);
