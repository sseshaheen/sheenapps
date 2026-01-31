'use client'

import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  author_type: 'client' | 'advisor' | 'ai';
  author_name: string;
  author_avatar?: string;
  advisor_guided?: boolean;
  cost_impact?: {
    type: 'session' | 'advised_minutes';
    rate: number;
  };
}

interface ChatIntegrationProps {
  messages: ChatMessage[];
  currentUser: {
    id: string;
    name: string;
    type: 'client' | 'advisor';
    avatar?: string;
  };
  advisor?: {
    id: string;
    name: string;
    avatar?: string;
    is_active: boolean;
    hourly_rate?: number;
  };
  onSendMessage: (content: string) => void;
  onInviteAdvisor?: () => void;
  className?: string;
}

export function ChatIntegration({ 
  messages, 
  currentUser, 
  advisor, 
  onSendMessage,
  onInviteAdvisor,
  className 
}: ChatIntegrationProps) {
  const [newMessage, setNewMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  const getAuthorAvatar = (message: ChatMessage) => {
    const fallback = message.author_type === 'ai' ? 'AI' : 
                     message.author_name.split(' ').map(n => n[0]).join('').toUpperCase();
    
    return (
      <Avatar className={cn(
        "w-8 h-8",
        message.author_type === 'ai' && "bg-gradient-to-r from-purple-500 to-blue-500",
        message.author_type === 'advisor' && "ring-2 ring-green-500 ring-offset-2",
        message.author_type === 'client' && "ring-2 ring-blue-500 ring-offset-2"
      )}>
        <AvatarImage src={message.author_avatar} alt={message.author_name} />
        <AvatarFallback className={cn(
          message.author_type === 'ai' && "text-white bg-gradient-to-r from-purple-500 to-blue-500"
        )}>
          {fallback}
        </AvatarFallback>
      </Avatar>
    );
  };

  const getMessageBadge = (message: ChatMessage) => {
    if (message.author_type === 'ai' && message.advisor_guided) {
      return (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
          <Icon name="user-check" className="w-3 h-3 me-1" />
          Advisor-Guided
        </Badge>
      );
    }

    if (message.cost_impact && message.author_type === 'advisor') {
      return (
        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
          <Icon name="clock" className="w-3 h-3 me-1" />
          Billable
        </Badge>
      );
    }

    return null;
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Chat Header with Participants */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Participants:</span>
            <div className="flex items-center gap-2">
              {/* Client Avatar */}
              <div className="flex items-center gap-1">
                <Avatar className="w-6 h-6 ring-2 ring-blue-500 ring-offset-1">
                  <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                  <AvatarFallback className="text-xs">
                    {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">You</span>
              </div>

              {/* Advisor Avatar */}
              {advisor ? (
                <div className="flex items-center gap-1">
                  <Avatar className="w-6 h-6 ring-2 ring-green-500 ring-offset-1">
                    <AvatarImage src={advisor.avatar} alt={advisor.name} />
                    <AvatarFallback className="text-xs">
                      {advisor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">
                    {advisor.name.split(' ')[0]}
                  </span>
                  {advisor.is_active && (
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  )}
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={onInviteAdvisor}>
                  <Icon name="user-plus" className="w-3 h-3 me-1" />
                  Invite Advisor
                </Button>
              )}

              {/* AI Avatar */}
              <div className="flex items-center gap-1">
                <Avatar className="w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-500">
                  <AvatarFallback className="text-white text-xs">AI</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">Assistant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Banner */}
        {advisor?.is_active && (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
            <Icon name="info" className="w-3 h-3 me-1" />
            Advisor active — consultations billed separately from ${advisor.hourly_rate || 35}/hr
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="flex gap-3">
            {getAuthorAvatar(message)}
            
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{message.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
                {getMessageBadge(message)}
              </div>
              
              <div className={cn(
                "text-sm p-3 rounded-lg max-w-2xl",
                message.author_type === 'client' && "bg-blue-50 dark:bg-blue-950/30",
                message.author_type === 'advisor' && "bg-green-50 dark:bg-green-950/30", 
                message.author_type === 'ai' && "bg-purple-50 dark:bg-purple-950/30"
              )}>
                {message.content}
              </div>

              {message.cost_impact && (
                <div className="text-xs text-muted-foreground">
                  <Icon name="clock" className="w-3 h-3 inline me-1" />
                  Billable time: ${message.cost_impact.rate}/hr
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              advisor?.is_active 
                ? "Type your message... (advisor will be notified)"
                : "Type your message..."
            }
            className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" disabled={!newMessage.trim()}>
            <Icon name="send" className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Advisor Welcome Message */}
      {advisor && !advisor.is_active && (
        <Card className="m-4 border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={advisor.avatar} alt={advisor.name} />
                <AvatarFallback>
                  {advisor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">
                  {advisor.name} has joined your project!
                </p>
                <p className="text-xs text-green-600">
                  They can now provide guidance and schedule consultations with you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper component for adding advisor to existing chat
export function AddAdvisorToChatButton({ 
  onInviteAdvisor,
  className 
}: { 
  onInviteAdvisor: () => void;
  className?: string;
}) {
  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onInviteAdvisor}
      className={className}
    >
      <Icon name="user-plus" className="w-4 h-4 me-2" />
      Add Advisor to Chat
    </Button>
  );
}

// Cost transparency banner component  
export function AdvisorActiveBanner({
  advisor,
  className
}: {
  advisor: { name: string; hourly_rate: number; };
  className?: string;
}) {
  return (
    <Card className={cn("border-amber-200 bg-amber-50", className)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icon name="info" className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-800">
            <strong>{advisor.name}</strong> is actively helping with this project. 
            Consultations are billed separately at <strong>${advisor.hourly_rate}/hour</strong>.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}