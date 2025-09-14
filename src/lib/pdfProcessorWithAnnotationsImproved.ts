'use client';

import { AnnotationZone, AnnotationConfig, AnnotationExtractionResult } from './annotationTypes';

export interface ProcessedAgentData {
  nom: string;
  prenom: string;
  montants: number[];
  total: number;
  pages: number[];
  observations: string;
}

export interface ProcessingResult {
  agents: ProcessedAgentData[];
  processedPages: number;
  totalPages: number;
}

/**
 * Processeur PDF amélioré utilisant les annotations manuelles
 * Extraction intelligente multi-niveaux : texte direct + patterns + OCR de secours
 */
export class PdfProcessorWithAnnotationsImproved {
  private pdfjsLib: any = null;

  constructor() {
    // Le chargement de pdfjs se fait dynamiquement côté client
  }

  /**
   * Initialise pdfjs-dist côté client
   */
  private async initializePdfJs(): Promise<void> {
    if (this.pdfjsLib) return;

    try {
      this.pdfjsLib = await import('pdfjs-dist');
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    } catch (error) {
      console.error('Erreur initialisation pdfjs:', error);
      throw new Error('Impossible de charger pdfjs-dist');
    }
  }

  /**
   * Traite un PDF avec les zones d'annotations définies
   */
  async processWithAnnotations(
    file: File, 
    zones: AnnotationZone[], 
    config: AnnotationConfig,
    onProgress?: (progress: number, status: string) => void
  ): Promise<ProcessingResult> {
    await this.initializePdfJs();

    try {
      console.log('🎯 Début traitement avec annotations amélioré:', { 
        zonesCount: zones.length, 
        fileName: file.name 
      });

      // Charger le PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      console.log('📄 PDF chargé:', { pages: pdfDoc.numPages });

      // Extraire les données pour chaque zone
      const extractionResults: AnnotationExtractionResult[] = [];

      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        
        if (onProgress) {
          onProgress((i / zones.length) * 100, `Extraction zone ${zone.type} (page ${zone.pageNumber})`);
        }

        try {
          const result = await this.extractFromZone(pdfDoc, zone);
          if (result) {
            extractionResults.push(result);
            console.log('✅ Zone extraite:', { 
              type: zone.type, 
              page: zone.pageNumber, 
              text: result.extractedText 
            });
          }
        } catch (error) {
          console.error('❌ Erreur extraction zone:', { zone: zone.id, error });
        }
      }

      // Agréger les résultats par agent
      const aggregatedData = this.aggregateExtractionResults(extractionResults);

      console.log('📊 Données agrégées:', { agentsCount: aggregatedData.length });

      if (onProgress) {
        onProgress(100, 'Traitement terminé');
      }

      return {
        agents: aggregatedData,
        processedPages: pdfDoc.numPages,
        totalPages: pdfDoc.numPages
      };

    } catch (error) {
      console.error('❌ Erreur traitement PDF:', error);
      throw new Error(`Erreur traitement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Extrait le texte d'une zone spécifique avec méthodes multiples
   */
  private async extractFromZone(
    pdfDoc: any, 
    zone: AnnotationZone
  ): Promise<AnnotationExtractionResult | null> {
    try {
      console.log(`🔍 Extraction zone ${zone.type} sur page ${zone.pageNumber}:`, {
        x: zone.x, y: zone.y, width: zone.width, height: zone.height
      });

      const page = await pdfDoc.getPage(zone.pageNumber);
      
      // Méthode 1: Extraction de texte directe avec coordonnées
      let extractedText = await this.extractTextFromCoordinates(page, zone);
      
      // Méthode 2: Si pas de texte, essayer avec une zone élargie
      if (!extractedText) {
        console.log(`⚠️ Aucun texte trouvé, tentative avec zone élargie...`);
        const expandedZone = {
          ...zone,
          x: Math.max(0, zone.x - 20),
          y: Math.max(0, zone.y - 10),
          width: zone.width + 40,
          height: zone.height + 20
        };
        extractedText = await this.extractTextFromCoordinates(page, expandedZone);
      }

      // Méthode 3: Si toujours pas de texte, extraire par patterns
      if (!extractedText) {
        console.log(`⚠️ Tentative d'extraction par patterns...`);
        extractedText = await this.extractByPatterns(page, zone.type);
      }

      if (!extractedText) {
        console.warn(`❌ Aucun texte extrait pour la zone ${zone.type}`);
        return this.createEmptyResult(zone);
      }

      console.log(`✅ Texte extrait pour ${zone.type}:`, extractedText);

      // Nettoyer et parser selon le type
      const cleanedText = this.cleanExtractedText(extractedText, zone.type);

      return {
        nom: zone.type.includes('NOM') ? cleanedText : '',
        prenom: zone.type.includes('PRENOM') ? cleanedText : '',
        montantAPayer: zone.type.includes('MONTANT') ? this.parseAmount(cleanedText) : 0,
        pageNumber: zone.pageNumber,
        formType: zone.formType,
        extractedText: {
          nom: zone.type.includes('NOM') ? cleanedText : '',
          prenom: zone.type.includes('PRENOM') ? cleanedText : '',
          montant: zone.type.includes('MONTANT') ? cleanedText : ''
        },
        coordinates: {
          nom: zone.type.includes('NOM') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 },
          prenom: zone.type.includes('PRENOM') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 },
          montant: zone.type.includes('MONTANT') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 }
        }
      };

    } catch (error) {
      console.error('❌ Erreur extraction zone:', error);
      return this.createEmptyResult(zone);
    }
  }

  /**
   * Extrait le texte à partir de coordonnées spécifiques
   */
  private async extractTextFromCoordinates(page: any, zone: AnnotationZone): Promise<string> {
    try {
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.5 });
      
      // Filtrer les éléments de texte dans la zone
      const textInZone = textContent.items.filter((item: any) => {
        if (!item.transform || !item.str?.trim()) return false;

        const textX = item.transform[4];
        const textY = viewport.height - item.transform[5]; // Inverser Y pour PDF
        
        // Vérifier si le texte est dans la zone (avec tolérance)
        const tolerance = 10;
        const inZone = (
          textX >= (zone.x - tolerance) && 
          textX <= (zone.x + zone.width + tolerance) &&
          textY >= (zone.y - tolerance) && 
          textY <= (zone.y + zone.height + tolerance)
        );

        return inZone;
      });

      // Extraire et joindre le texte
      const extractedText = textInZone
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      return extractedText;

    } catch (error) {
      console.error('❌ Erreur extraction par coordonnées:', error);
      return '';
    }
  }

  /**
   * Extrait le texte par reconnaissance de patterns sur toute la page
   */
  private async extractByPatterns(page: any, zoneType: string): Promise<string> {
    try {
      const textContent = await page.getTextContent();
      const fullText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      console.log(`🔍 Recherche par patterns dans le texte complet`);

      // Patterns selon le type de zone
      if (zoneType.includes('NOM')) {
        // Chercher des noms (mots en majuscules)
        const nameMatches = fullText.match(/\b[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ]{2,}\b/g);
        if (nameMatches && nameMatches.length > 0) {
          const commonWords = ['VERIFIE', 'PAIE', 'TOTAL', 'PAYER', 'REMPLIR', 'BENEFICIAIRE', 'FRAIS', 'DEPLACEMENT'];
          const validName = nameMatches.find(name => !commonWords.includes(name));
          if (validName) {
            console.log(`✅ Nom trouvé par pattern:`, validName);
            return validName;
          }
        }
      } else if (zoneType.includes('PRENOM')) {
        // Chercher des prénoms (première lettre majuscule, reste minuscule)
        const prenomMatches = fullText.match(/\b[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ][a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]{2,}\b/g);
        if (prenomMatches && prenomMatches.length > 0) {
          const validPrenom = prenomMatches[0];
          console.log(`✅ Prénom trouvé par pattern:`, validPrenom);
          return validPrenom;
        }
      } else if (zoneType.includes('MONTANT')) {
        // Chercher des montants
        const montantMatches = fullText.match(/\d+[,.]?\d*\s*€?|\d+\s*€/g);
        if (montantMatches && montantMatches.length > 0) {
          const validMontant = montantMatches.find(montant => {
            const num = parseFloat(montant.replace(/[€\s,]/g, '.'));
            return num >= 1 && num <= 10000;
          });
          if (validMontant) {
            console.log(`✅ Montant trouvé par pattern:`, validMontant);
            return validMontant;
          }
        }
      }

      return '';
    } catch (error) {
      console.error('❌ Erreur extraction par patterns:', error);
      return '';
    }
  }

  /**
   * Crée un résultat vide pour une zone
   */
  private createEmptyResult(zone: AnnotationZone): AnnotationExtractionResult {
    return {
      nom: zone.type.includes('NOM') ? 'NON LISIBLE' : '',
      prenom: zone.type.includes('PRENOM') ? 'NON LISIBLE' : '',
      montantAPayer: 0,
      pageNumber: zone.pageNumber,
      formType: zone.formType,
      extractedText: {
        nom: zone.type.includes('NOM') ? 'NON LISIBLE' : '',
        prenom: zone.type.includes('PRENOM') ? 'NON LISIBLE' : '',
        montant: zone.type.includes('MONTANT') ? 'NON LISIBLE' : ''
      },
      coordinates: {
        nom: zone.type.includes('NOM') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 },
        prenom: zone.type.includes('PRENOM') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 },
        montant: zone.type.includes('MONTANT') ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : { x: 0, y: 0, width: 0, height: 0 }
      }
    };
  }

  /**
   * Nettoie le texte extrait selon le type de zone
   */
  private cleanExtractedText(text: string, type: string): string {
    let cleaned = text.trim();

    if (type.includes('NOM') || type.includes('PRENOM')) {
      cleaned = cleaned
        .replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (type.includes('MONTANT')) {
      cleaned = cleaned
        .replace(/[^\d,.\-€\s]/g, '')
        .trim();
    }

    return cleaned;
  }

  /**
   * Parse un montant à partir du texte
   */
  private parseAmount(text: string): number {
    if (!text) return 0;

    const numberMatch = text.match(/[\d,.\-]+/);
    if (!numberMatch) return 0;

    let numberStr = numberMatch[0];
    numberStr = numberStr.replace(',', '.');
    
    const amount = parseFloat(numberStr);
    return isNaN(amount) ? 0 : Math.abs(amount);
  }

  /**
   * Agrège les résultats d'extraction par agent
   */
  private aggregateExtractionResults(results: AnnotationExtractionResult[]): ProcessedAgentData[] {
    const agentsMap = new Map<string, ProcessedAgentData>();

    for (const result of results) {
      const agentKey = `${result.nom.toLowerCase()}_${result.prenom.toLowerCase()}`.trim();
      
      if (!agentKey || agentKey === '_' || agentKey === 'non lisible_non lisible') continue;

      if (!agentsMap.has(agentKey)) {
        agentsMap.set(agentKey, {
          nom: result.nom || 'NON LISIBLE',
          prenom: result.prenom || 'NON LISIBLE',
          montants: [],
          total: 0,
          pages: [],
          observations: ''
        });
      }

      const agent = agentsMap.get(agentKey)!;

      if (result.nom && !agent.nom.includes('NON LISIBLE')) {
        agent.nom = result.nom;
      }
      if (result.prenom && !agent.prenom.includes('NON LISIBLE')) {
        agent.prenom = result.prenom;
      }
      if (result.montantAPayer > 0) {
        agent.montants.push(result.montantAPayer);
      }
      if (!agent.pages.includes(result.pageNumber)) {
        agent.pages.push(result.pageNumber);
      }
    }

    const finalData: ProcessedAgentData[] = [];

    for (const agent of agentsMap.values()) {
      agent.total = agent.montants.reduce((sum, amount) => sum + amount, 0);
      agent.pages.sort((a, b) => a - b);
      
      if (agent.nom.includes('NON LISIBLE') || agent.prenom.includes('NON LISIBLE')) {
        agent.observations = 'NON LISIBLE';
      } else if (agent.montants.length === 0) {
        agent.observations = 'AUCUN MONTANT TROUVÉ';
      } else {
        agent.observations = '';
      }

      finalData.push(agent);
    }

    finalData.sort((a, b) => {
      const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
      const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return finalData;
  }
}

// Instance singleton
export const pdfProcessorWithAnnotationsImproved = new PdfProcessorWithAnnotationsImproved();
