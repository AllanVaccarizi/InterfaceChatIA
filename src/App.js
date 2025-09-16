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
  }, []);

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

  // Charger les messages d'une conversation (simulé avec le contenu actuel)
  const loadMessages = async (conversationId) => {
    console.log('Chargement messages pour conversation:', conversationId);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('session_id', conversationId)
        .single();

      if (error) {
        console.error('Erreur Supabase:', error);
        throw error;
      }
      
      console.log('Conversation chargée:', data);
      
      // Pour l'instant, créer un message fictif basé sur le contenu
      // Vous devrez adapter cette partie selon votre logique métier
      const messagesArray = [];
      if (data.message && data.message !== 'NULL') {
        messagesArray.push({
          id: `msg_${data.session_id}`,
          role: 'user',
          content: data.message,
          created_at: data.created_at
        });
      }
      
      setMessages(messagesArray);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
      setMessages([]);
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
    console.log('Sélection conversation:', conversationId);
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
      // Mettre à jour la conversation avec le nouveau message
      const { data: updatedConversation, error: updateError } = await supabase
        .from('conversations')
        .update({ 
          message: messageText,
          updated_at: new Date().toISOString() 
        })
        .eq('session_id', activeConversation)
        .select()
        .single();

      if (updateError) throw updateError;

      // Ajouter le message à l'interface immédiatement
      const newMsg = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageText,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);

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
      
      // Recharger les messages après un délai pour voir la réponse
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

  // Ajouter une réponse de l'assistant (en cas d'erreur)
  const addAssistantMessage = async (conversationId, content) => {
    const assistantMessage = {
      id: `msg_assistant_${Date.now()}`,
      role: 'assistant',
      content: content,
      created_at: new Date().toISOString()
    };

    if (conversationId === activeConversation) {
      setMessages(prev => [...prev, assistantMessage]);
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