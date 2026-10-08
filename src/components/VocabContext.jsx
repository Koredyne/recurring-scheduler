import { createContext, useContext } from 'react';
import { GYM } from '../lib/vocab.js';

// The words for the current kind of business (see lib/vocab.js). App provides it from state.settings.
export const VocabContext = createContext(GYM);
export const useVocab = () => useContext(VocabContext);
