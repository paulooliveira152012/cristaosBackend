// =====================================================
// server/models/suggestion.model.js (Mongoose Model)
// =====================================================
const mongoose = require('mongoose');


const VALID_TYPES = ['bug', 'sugestao', 'ideia'];
const VALID_STATUS = ['pendente', 'em_andamento', 'concluido'];
const VALID_SEVERITY = ['baixo', 'médio', 'alto', 'crítico'];


const SuggestionSchema = new mongoose.Schema(
{
type: { type: String, enum: VALID_TYPES, required: true, index: true },
title: { type: String, required: true, trim: true },
description: { type: String, required: true, trim: true },
severity: { type: String, enum: VALID_SEVERITY },
status: { type: String, enum: VALID_STATUS, default: 'pendente', index: true },
voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
author: {
_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
name: String,
avatar: String,
},
},
{ timestamps: true }
);


SuggestionSchema.virtual('votes').get(function () {
return Array.isArray(this.voters) ? this.voters.length : 0;
});


SuggestionSchema.set('toJSON', {
virtuals: true,
transform: (_, ret) => { delete ret.__v; return ret; },
});


const Suggestion = mongoose.models.Suggestion || mongoose.model('Suggestion', SuggestionSchema);


module.exports.Suggestion = Suggestion;
module.exports.VALID_TYPES = VALID_TYPES;
module.exports.VALID_STATUS = VALID_STATUS;
module.exports.VALID_SEVERITY = VALID_SEVERITY;