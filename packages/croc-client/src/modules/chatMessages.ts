import { Actions, ADD_CHAT_MESSAGES } from 'croc-actions';

export interface ChatMessage {
  text: string,
  from?: string,
};

export const reducer = (state: ChatMessage[] = [], action: Actions) => {
  switch (action.type) {
    case ADD_CHAT_MESSAGES:
      let newMessages = action.payload;

      if (action.syncData && action.syncData.from) {
        newMessages = newMessages.map(message => ({ ...message, from: action.syncData.from }));
      }

      return [ ...state, ...newMessages ];
    default:
      return state;
  }
}