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
  const [sidebarOpen, setSidebarOpen] = useState(false); // État pour la sidebar mobile
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
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
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
      setActiveConversation(data.id);
      setMessages([]);
      setSidebarOpen(false); // Fermer la sidebar sur mobile après sélection
    } catch (error) {
      console.error('Erreur création conversation:', error);
    }
  };

  // Sélectionner une conversation
  const selectConversation = (conversationId) => {
    setActiveConversation(conversationId);
    loadMessages(conversationId);
    setSidebarOpen(false); // Fermer la sidebar sur mobile après sélection
  };

  // Supprimer une conversation
  const deleteConversation = async (conversationId, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
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
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
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
      // Sauvegarder le message utilisateur
      const { data: userMessage, error: userError } = await supabase
        .from('messages')
        .insert([{
          conversation_id: activeConversation,
          role: 'user',
          content: messageText
        }])
        .select()
        .single();

      if (userError) throw userError;

      // Ajouter le message à l'interface
      setMessages(prev => [...prev, userMessage]);

      // Mettre à jour la date de dernière modification de la conversation
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeConversation);

      // Envoyer à N8N
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
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          conversation_id: conversationId,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Erreur webhook N8N: ${response.status}`);
      }

      console.log('Message envoyé à N8N avec succès');
      
      setTimeout(() => {
        loadMessages(conversationId);
      }, 3000);

    } catch (error) {
      console.error('Erreur N8N:', error);
      setTimeout(async () => {
        await addAssistantMessage(conversationId, "Désolé, une erreur s'est produite avec le service IA.");
      }, 2000);
    }
  };

  // Ajouter une réponse de l'assistant (utilisé seulement en cas d'erreur maintenant)
  const addAssistantMessage = async (conversationId, content) => {
    try {
      const { data: assistantMessage, error } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          role: 'assistant',
          content: content
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
              key={conversation.id}
              className={`conversation-item ${activeConversation === conversation.id ? 'active' : ''}`}
              onClick={() => selectConversation(conversation.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                startEditingTitle(conversation.id, conversation.title, e);
              }}
            >
              <MessageCircle size={16} />
              {editingConversation === conversation.id ? (
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, conversation.id)}
                  onBlur={() => saveNewTitle(conversation.id)}
                  className="title-input"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="conversation-title">{conversation.title}</span>
              )}
              <button
                className="delete-btn"
                onClick={(e) => deleteConversation(conversation.id, e)}
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
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                >
                  <div className="message-content">
                    {message.content}
                  </div>
                  <div className="message-time">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
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