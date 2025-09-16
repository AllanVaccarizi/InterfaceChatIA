// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { MessageCircle, Plus, Send, Trash2, Menu, X } from 'lucide-react';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingConversation, setEditingConversation] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Charger les conversations au démarrage
  useEffect(() => {
    loadConversations();
  }, [activeConversation]);

  // Scroll automatique vers le bas
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Charger toutes les conversations
  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    }
  };

  // Charger les messages d'une conversation
  const loadMessages = async (conversationId) => {
    try {
      const { data, error } = await supabase
        .from('chat_automation')  // Changement: utilise la table chat_automation
        .select('*')
        .eq('session_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  // Créer une nouvelle conversation
  const createNewConversation = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{ title: 'Nouvelle conversation' }])
        .select()
        .single();

      if (error) throw error;

      setConversations(prev => [data, ...prev]);
      setActiveConversation(data.session_id);
      setMessages([]);
      setSidebarOpen(false);
    } catch (error) {
      console.error('Erreur création conversation:', error);
    }
  };

  // Sélectionner une conversation
  const selectConversation = (conversationId) => {
    setActiveConversation(conversationId);
    loadMessages(conversationId);
    setSidebarOpen(false);
  };

  // Supprimer une conversation
  const deleteConversation = async (conversationId, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('session_id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.filter(conv => conv.session_id !== conversationId));
      if (activeConversation === conversationId) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Erreur suppression conversation:', error);
    }
  };

  // Commencer l'édition du titre
  const startEditingTitle = (conversationId, currentTitle, e) => {
    e.stopPropagation();
    setEditingConversation(conversationId);
    setNewTitle(currentTitle);
  };

  // Sauvegarder le nouveau titre
  const saveNewTitle = async (conversationId) => {
    if (!newTitle.trim()) return;

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title: newTitle.trim() })
        .eq('session_id', conversationId);

      if (error) throw error;

      setConversations(prev => 
        prev.map(conv => 
          conv.session_id === conversationId
            ? { ...conv, title: newTitle.trim() }
            : conv
        )
      );
      setEditingConversation(null);
      setNewTitle('');
    } catch (error) {
      console.error('Erreur mise à jour titre:', error);
    }
  };

  // Annuler l'édition
  const cancelEditing = () => {
    setEditingConversation(null);
    setNewTitle('');
  };

  // Gérer la touche Entrée
  const handleKeyPress = (e, conversationId) => {
    if (e.key === 'Enter') {
      saveNewTitle(conversationId);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Fermer la sidebar quand on clique sur l'overlay
  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Envoyer un message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversation) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setLoading(true);

    try {
      // CHANGEMENT : On n'écrit plus en base depuis React
      // On ajoute seulement le message dans l'UI temporairement
      const tempUserMessage = {
        id: 'temp_' + Date.now(),
        session_id: activeConversation,
        role: 'user',
        message: messageText,
        created_at: new Date().toISOString()
      };

      // Ajouter le message à l'interface temporairement
      setMessages(prev => [...prev, tempUserMessage]);

      // Mettre à jour la date de dernière modification de la conversation
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('session_id', activeConversation);

      // Envoyer à N8N - C'est N8N qui va gérer l'historique
      await sendToN8N(messageText, activeConversation);

    } catch (error) {
      console.error('Erreur envoi message:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour envoyer à N8N
  const sendToN8N = async (message, conversationId) => {
    try {
      const webhookUrl = process.env.REACT_APP_N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('URL webhook N8N non configurée');
      }
      
      const payload = {
        message: message,
        session_id: conversationId,
        timestamp: new Date().toISOString(),
        // Champs requis par Postgres Chat Memory
        role: 'user',           // IMPORTANT : Le rôle de l'utilisateur
        input: message,         // Le message d'entrée
        chatInput: message      // Nom alternatif que le nœud pourrait chercher
      };

      // DEBUG : Vérifiez ce qui est envoyé
      console.log('🚀 Payload envoyé à N8N:', JSON.stringify(payload, null, 2));
      console.log('🔍 Types:', {
        message: typeof message,
        session_id: typeof conversationId,
        conversationId_value: conversationId
      });

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erreur webhook N8N: ${response.status}`);
      }

      console.log('Message envoyé à N8N avec succès');
      
      // Recharger les messages depuis la base (N8N aura ajouté le message user + la réponse IA)
      setTimeout(() => {
        loadMessages(conversationId);
      }, 2000); // Réduit le délai car N8N est plus rapide

    } catch (error) {
      console.error('Erreur N8N:', error);
      // En cas d'erreur, on recharge quand même les messages au cas où N8N aurait partiellement traité
      setTimeout(() => {
        loadMessages(conversationId);
      }, 1000);
    }
  };

  // Ajouter une réponse de l'assistant - CHANGEMENT ICI: 'session_id' au lieu de 'conversation_id'
  const addAssistantMessage = async (conversationId, messageContent) => {
    try {
      const { data: assistantMessage, error } = await supabase
        .from('messages')
        .insert([{
          session_id: conversationId,
          role: 'assistant',
          message: messageContent  // 'message' au lieu de 'content'
        }])
        .select()
        .single();

      if (error) throw error;

      if (conversationId === activeConversation) {
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Erreur ajout message assistant:', error);
    }
  };

  return (
    <div className="app">
      {/* Overlay pour fermer la sidebar sur mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar}></div>}

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          {/* Bouton fermer pour mobile */}
          <button 
            className="mobile-close-btn"
            onClick={closeSidebar}
          >
            <X size={20} />
          </button>
          <button className="new-chat-btn" onClick={createNewConversation}>
            <Plus size={20} />
            Nouvelle conversation
          </button>
        </div>

        <div className="conversations-list">
          {conversations.map((conversation) => (
            <div
              key={conversation.session_id}
              className={`conversation-item ${activeConversation === conversation.session_id ? 'active' : ''}`}
              onClick={() => selectConversation(conversation.session_id)}
              onContextMenu={(e) => {
                e.preventDefault();
                startEditingTitle(conversation.session_id, conversation.title, e);
              }}
            >
              <MessageCircle size={16} />
              {editingConversation === conversation.session_id ? (
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, conversation.session_id)}
                  onBlur={() => saveNewTitle(conversation.session_id)}
                  className="title-input"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="conversation-title">{conversation.title}</span>
              )}
              <button
                className="delete-btn"
                onClick={(e) => deleteConversation(conversation.session_id, e)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          
          {conversations.length > 0 && (
            <div className="conversation-hint">
              Clic droit pour changer le nom de la conversation
            </div>
          )}
        </div>
      </div>

      {/* Bouton burger pour mobile */}
      <button 
        className={`mobile-menu-btn ${sidebarOpen ? 'hidden' : ''}`}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={24} />
      </button>

      {/* Zone de chat principale */}
      <div className="chat-area">
        {activeConversation ? (
          <>
            <div className="messages-container">
              {messages.map((message) => {
                // Fonction pour extraire le contenu du message
                const getMessageContent = (msg) => {
                  try {
                    // Si message est déjà un objet (JSONB de Postgres)
                    if (typeof msg.message === 'object' && msg.message !== null) {
                      return msg.message.content || JSON.stringify(msg.message);
                    }
                    
                    // Si le message est un string JSON, on le parse
                    if (typeof msg.message === 'string' && msg.message.startsWith('{')) {
                      const parsed = JSON.parse(msg.message);
                      return parsed.content || msg.message;
                    }
                    
                    // Si c'est un string simple
                    if (typeof msg.message === 'string') {
                      return msg.message;
                    }
                    
                    // Fallback : convertir en string
                    return String(msg.message);
                  } catch (error) {
                    // En cas d'erreur, convertir en string
                    console.error('Erreur parsing message:', error);
                    return String(msg.message);
                  }
                };

                // Fonction pour déterminer le rôle du message
                const getMessageRole = (msg) => {
                  try {
                    // Si message est un objet JSONB
                    if (typeof msg.message === 'object' && msg.message !== null) {
                      if (msg.message.type === 'human') return 'user';
                      if (msg.message.type === 'ai') return 'assistant';
                    }
                    
                    // Si c'est un JSON string
                    if (typeof msg.message === 'string' && msg.message.startsWith('{')) {
                      const parsed = JSON.parse(msg.message);
                      if (parsed.type === 'human') return 'user';
                      if (parsed.type === 'ai') return 'assistant';
                    }
                    
                    // Fallback sur la colonne role ou défaut
                    return msg.role || 'user';
                  } catch (error) {
                    return msg.role || 'user';
                  }
                };

                // Fonction pour formater le markdown simple
                const formatMarkdown = (text) => {
                  if (!text || typeof text !== 'string') return text;
                  
                  return text
                    // Titres H2 (##)
                    .replace(/^## (.+)$/gm, '<h3 class="message-h2">$1</h3>')
                    // Titres H3 (###)  
                    .replace(/^### (.+)$/gm, '<h4 class="message-h3">$1</h4>')
                    // Gras (**text**)
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    // Italique (*text*)
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    // Code inline (`code`)
                    .replace(/`(.+?)`/g, '<code class="message-code">$1</code>')
                    // Liens [text](url)
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>')
                    // Liens simples (détection automatique des URLs)
                    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>')
                    // Sauts de ligne
                    .replace(/\n/g, '<br/>');
                };

                const messageContent = getMessageContent(message);
                const messageRole = getMessageRole(message);
                const formattedContent = formatMarkdown(messageContent);

                return (
                  <div
                    key={message.id}
                    className={`message ${messageRole === 'user' ? 'user-message' : 'assistant-message'}`}
                  >
                    <div 
                      className="message-content"
                      dangerouslySetInnerHTML={{ __html: formattedContent }}
                    />
                    <div className="message-time">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="message assistant-message">
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-form" onSubmit={sendMessage}>
              <div className="message-input-container">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Tapez votre message..."
                  className="message-input"
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="send-button"
                  disabled={!newMessage.trim() || loading}
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="no-conversation">
            <h2>Bienvenue dans votre assistant IA</h2>
            <p>Sélectionnez une conversation ou créez-en une nouvelle pour commencer.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;