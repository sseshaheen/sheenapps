/**
 * Sanity Document List Component
 * Displays and manages Sanity documents with filtering and actions
 * Follows existing UI patterns and design system
 */

'use client'

import { useState } from 'react';
import { useSanityDocuments } from '@/hooks/use-sanity-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Globe, 
  Calendar, 
  RefreshCw, 
  Search,
  Filter,
  Eye,
  Edit,
  MoreHorizontal,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { SanityDocumentListProps, GetDocumentsFilters, SanityDocument } from '@/types/sanity-integration';

export function SanityDocumentList({
  connectionId,
  documentType,
  versionType,
  language,
  limit = 50
}: SanityDocumentListProps) {
  const [filters, setFilters] = useState<GetDocumentsFilters>({
    document_type: documentType,
    version_type: versionType,
    language: language,
    limit
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const {
    documents,
    isLoading,
    error,
    refetch,
    syncDocuments,
    isSyncing,
    syncError,
    syncResult,
    getDocumentsByType,
    getDocumentsByLanguage,
    getDraftDocuments,
    getPublishedDocuments
  } = useSanityDocuments(connectionId, filters);

  const updateFilter = (key: keyof GetDocumentsFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  // Filter documents by search query
  const filteredDocuments = documents.filter(doc => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      doc.title?.toLowerCase().includes(searchLower) ||
      doc.document_id.toLowerCase().includes(searchLower) ||
      doc.document_type.toLowerCase().includes(searchLower) ||
      doc.slug?.toLowerCase().includes(searchLower)
    );
  });

  // Get unique document types for filter
  const documentTypes: string[] = [...new Set(documents.map(doc => String(doc.document_type || '')))].filter(Boolean) as string[];
  const languages: string[] = [...new Set(documents.map(doc => String(doc.language || '')))].filter(Boolean) as string[];

  const getStatusBadge = (doc: SanityDocument) => {
    const variant = doc.version_type === 'published' ? 'default' : 'secondary';
    return (
      <Badge variant={variant} className="text-xs">
        {doc.version_type}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-muted-foreground">Failed to load documents</p>
            <p className="text-xs text-red-600">{error.message}</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Content Documents</h3>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : `${filteredDocuments.length} of ${documents.length} documents`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="outline"
            size="sm"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          
          <Button
            onClick={() => syncDocuments({})}
            disabled={isSyncing}
            variant="outline"
            size="sm"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync
          </Button>
        </div>
      </div>

      {/* Sync Status */}
      {syncResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3">
            <p className="text-sm text-green-800">
              ✅ Sync completed: {syncResult.documents_synced} documents processed 
              ({syncResult.documents_created} created, {syncResult.documents_updated} updated, {syncResult.documents_deleted} deleted)
            </p>
          </CardContent>
        </Card>
      )}

      {syncError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <p className="text-sm text-red-800">
              ❌ Sync failed: {syncError.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          {showFilters && (
            <>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select 
                    value={filters.document_type || ''} 
                    onValueChange={(value) => updateFilter('document_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All types</SelectItem>
                      {documentTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Version</Label>
                  <Select 
                    value={filters.version_type || ''} 
                    onValueChange={(value: 'draft' | 'published' | '') => updateFilter('version_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All versions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All versions</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select 
                    value={filters.language || ''} 
                    onValueChange={(value) => updateFilter('language', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All languages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All languages</SelectItem>
                      {languages.map(lang => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Limit</Label>
                  <Select 
                    value={filters.limit?.toString() || '50'} 
                    onValueChange={(value) => updateFilter('limit', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Document List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No documents match your search' : 'No documents found'}
              </p>
              {!searchQuery && (
                <Button onClick={() => syncDocuments({})} variant="outline" size="sm">
                  Sync Documents
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium truncate">
                        {doc.title || doc.document_id}
                      </h4>
                      {getStatusBadge(doc)}
                      <Badge variant="outline" className="text-xs">
                        {doc.document_type}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {doc.language}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(doc.last_modified)}
                      </div>
                    </div>

                    {doc.slug && (
                      <p className="text-xs text-muted-foreground">
                        Slug: <code className="bg-muted px-1 rounded">{doc.slug}</code>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-semibold text-green-600">
                {getPublishedDocuments().length}
              </div>
              <div className="text-muted-foreground">Published</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold text-orange-600">
                {getDraftDocuments().length}
              </div>
              <div className="text-muted-foreground">Drafts</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold text-blue-600">
                {documentTypes.length}
              </div>
              <div className="text-muted-foreground">Types</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-semibold text-purple-600">
                {languages.length}
              </div>
              <div className="text-muted-foreground">Languages</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}