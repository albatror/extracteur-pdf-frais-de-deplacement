'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PdfAnnotationEditor } from './PdfAnnotationEditor';
import { AnnotationZone, AnnotationConfig } from '@/lib/annotationTypes';
import { pdfProcessorWithAnnotationsImproved, ProcessedAgentData } from '@/lib/pdfProcessorWithAnnotationsImproved';

interface ProcessingProgress {
  progress: number;
  status: string;
  isProcessing: boolean;
}

export function ExpensePdfProcessor() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [zones, setZones] = useState<AnnotationZone[]>([]);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    progress: 0,
    status: '',
    isProcessing: false
  });
  const [results, setResults] = useState<ProcessedAgentData[]>([]);
  const [error, setError] = useState<string>('');

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length !== files.length) {
      setError('Seuls les fichiers PDF sont acceptés');
      return;
    }
    
    setSelectedFiles(pdfFiles);
    setError('');
    setResults([]);
  }, []);

  const handleZonesUpdate = useCallback((newZones: AnnotationZone[]) => {
    setZones(newZones);
  }, []);

  const handleProcessFiles = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setError('Veuillez sélectionner au moins un fichier PDF');
      return;
    }

    if (zones.length === 0) {
      setError('Veuillez définir au moins une zone d\'extraction');
      return;
    }

    setProcessingProgress({ progress: 0, status: 'Initialisation...', isProcessing: true });
    setError('');
    setResults([]);

    try {
      const config: AnnotationConfig = {
        usePresets: false,
        customZones: zones,
        enhanceImage: true,
        ocrOptions: {
          lang: 'fra'
        }
      };

      const allResults: ProcessedAgentData[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        setProcessingProgress({
          progress: (i / selectedFiles.length) * 100,
          status: `Traitement de ${file.name}...`,
          isProcessing: true
        });

        const result = await pdfProcessorWithAnnotationsImproved.processWithAnnotations(
          file,
          zones,
          config,
          (progress, status) => {
            const globalProgress = ((i / selectedFiles.length) + (progress / 100 / selectedFiles.length)) * 100;
            setProcessingProgress({
              progress: globalProgress,
              status: `${file.name}: ${status}`,
              isProcessing: true
            });
          }
        );

        allResults.push(...result.agents);
      }

      setResults(allResults);
      setProcessingProgress({
        progress: 100,
        status: `Traitement terminé - ${allResults.length} agents trouvés`,
        isProcessing: false
      });

    } catch {
      console.error('Erreur traitement:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setProcessingProgress({ progress: 0, status: '', isProcessing: false });
    }
  }, [selectedFiles, zones]);

  const exportToExcel = useCallback(async () => {
    if (results.length === 0) return;

    try {
      const XLSX = await import('xlsx');
      const { saveAs } = await import('file-saver');

      const excelData = results.map(agent => ({
        'NOM': agent.nom,
        'PRENOM': agent.prenom,
        'TOTAL': `${agent.total.toFixed(2)} €`,
        'MONTANTS': agent.montants.map(m => `${m.toFixed(2)} €`).join(', '),
        'PAGES': agent.pages.join(', '),
        'OBSERVATIONS': agent.observations
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Frais de Déplacement');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      saveAs(blob, `frais_deplacement_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch {
      setError('Erreur lors de l\'export Excel');
    }
  }, [results]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card className="mb-6">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            Extracteur de Frais de Déplacement PDF - Version Améliorée
          </CardTitle>
          <CardDescription className="text-lg">
            Extraction intelligente avec méthodes multiples : texte direct + patterns + OCR de secours
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="files" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="files">📁 Fichiers</TabsTrigger>
          <TabsTrigger value="zones">🎯 Zones</TabsTrigger>
          <TabsTrigger value="processing">⚡ Traitement</TabsTrigger>
          <TabsTrigger value="results">📊 Résultats</TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Sélection des fichiers PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="pdf-files">Fichiers PDF</Label>
                <Input
                  id="pdf-files"
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="mt-2"
                />
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Fichiers sélectionnés :</h4>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span>{file.name}</span>
                      <Badge variant="secondary">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zones">
          <Card>
            <CardHeader>
              <CardTitle>Définition des zones d&apos;extraction</CardTitle>
              <CardDescription>
                Définissez les zones pour extraire NOM, PRÉNOM et MONTANT À PAYER
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedFiles.length > 0 ? (
                <PdfAnnotationEditor
                  file={selectedFiles[0]}
                  zones={zones}
                  onZonesChange={handleZonesUpdate}
                />
              ) : (
                <Alert>
                  <AlertDescription>
                    Veuillez d&apos;abord sélectionner un fichier PDF dans l&apos;onglet &quot;Fichiers&quot;
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processing">
          <Card>
            <CardHeader>
              <CardTitle>Traitement des PDFs</CardTitle>
              <CardDescription>
                Extraction intelligente : 1) Texte direct → 2) Zone élargie → 3) Patterns automatiques
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleProcessFiles}
                disabled={processingProgress.isProcessing || selectedFiles.length === 0 || zones.length === 0}
                className="w-full"
              >
                {processingProgress.isProcessing ? 'Traitement en cours...' : '🔄 Traiter les PDFs'}
              </Button>

              {processingProgress.isProcessing && (
                <div className="space-y-2">
                  <Progress value={processingProgress.progress} className="w-full" />
                  <p className="text-sm text-gray-600">{processingProgress.status}</p>
                </div>
              )}

              {processingProgress.status && !processingProgress.isProcessing && (
                <Alert>
                  <AlertDescription>{processingProgress.status}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle>Résultats de l&apos;extraction</CardTitle>
              {results.length > 0 && (
                <Button onClick={exportToExcel} variant="outline">
                  📊 Exporter vers Excel
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {results.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NOM</TableHead>
                      <TableHead>PRÉNOM</TableHead>
                      <TableHead>TOTAL</TableHead>
                      <TableHead>MONTANTS</TableHead>
                      <TableHead>PAGES</TableHead>
                      <TableHead>OBSERVATIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((agent, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{agent.nom}</TableCell>
                        <TableCell>{agent.prenom}</TableCell>
                        <TableCell>{agent.total.toFixed(2)} €</TableCell>
                        <TableCell>
                          {agent.montants.map(m => `${m.toFixed(2)} €`).join(', ')}
                        </TableCell>
                        <TableCell>{agent.pages.join(', ')}</TableCell>
                        <TableCell>
                          {agent.observations && (
                            <Badge variant={agent.observations.includes('NON LISIBLE') ? 'destructive' : 'secondary'}>
                              {agent.observations}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Alert>
                  <AlertDescription>
                    Aucun résultat disponible. Veuillez traiter des fichiers PDF.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
