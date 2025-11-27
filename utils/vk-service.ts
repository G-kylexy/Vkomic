
import { VkNode } from '../types';

const API_VERSION = '5.131';

// --- DONNÉES DE SECOURS (FALLBACK) ---
// Utilisées si l'API VK échoue ou si le token est invalide, 
// pour garder l'interface navigable.
const MOCK_ROOT_NODES: VkNode[] = [
  {
    id: 'topic_47386771',
    title: 'BDs EN FRANÇAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47386771',
    url: 'https://vk.com/topic-203785966_47386771',
    children: [],
    isLoaded: false
  },
  {
    id: 'topic_47423270',
    title: 'MANGAS EN FRANÇAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47423270',
    url: 'https://vk.com/topic-203785966_47423270',
    children: [],
    isLoaded: false
  },
  {
    id: 'topic_47543940',
    title: 'COMICS EN FRANÇAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47543940',
    url: 'https://vk.com/topic-203785966_47543940',
    children: [],
    isLoaded: false
  }
];

// --- HACK JSONP ---
// L'API VK ne supporte pas le CORS (Cross-Origin Resource Sharing) pour les requêtes frontend directes.
// JSONP permet de contourner cela en injectant une balise <script> qui exécute un callback.
const jsonp = (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const callbackName = 'vk_cb_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.body.removeChild(script);
      resolve(data);
    };

    script.src = `${url}&callback=${callbackName}`;
    script.onerror = (err) => {
      delete (window as any)[callbackName];
      document.body.removeChild(script);
      reject(err);
    };
    document.body.appendChild(script);
  });
};

// --- API Calls ---

// Récupère les commentaires d'un topic VK (c'est là que sont listés les liens)
export const fetchVkTopic = async (token: string, groupId: string, topicId: string): Promise<any> => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  const url = `https://api.vk.com/method/board.getComments?access_token=${token}&group_id=${groupId}&topic_id=${topicId}&count=100&extended=1&v=${API_VERSION}`;
  return jsonp(url);
};

// --- LOGIQUE DE PARSING (ANALYSE DE TEXTE) ---

const cleanTitle = (text: string) => {
    return text
        .replace(/[:\-]+$/, '') 
        .replace(/^►+\s*/, '') 
        .replace(/\s*◄+$/, '') 
        .replace(/\(lien\)/gi, '')
        .trim();
};

// Analyse le texte brut des messages pour trouver "Titre de la BD -> Lien VK"
const parseTopicBody = (text: string): VkNode[] => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nodes: VkNode[] = [];
  const seenIds = new Set<string>(); // Set pour éviter les doublons
  
  const linkRegex = /vk\.com\/topic-(\d+)_(\d+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('vk.com/topic-')) {
      const match = line.match(linkRegex);
      if (match) {
        const topicId = match[2];
        const uniqueId = `topic_${topicId}`;

        // ANTI-DOUBLON : Si on a déjà traité cet ID, on passe
        if (seenIds.has(uniqueId)) continue;

        let title = '';

        const parts = line.split(/http|vk\.com/);
        // Cas 1: "Naruto : http://vk.com..." (Sur la même ligne)
        if (parts[0].trim().length > 3) {
            title = parts[0];
        } 
        // Cas 2: "Naruto" (Ligne précédente)
        // http://vk.com... (Ligne actuelle)
        else if (i > 0) {
            const prevLine = lines[i - 1];
            if (!prevLine.includes('vk.com') && prevLine.length > 2) {
                title = prevLine;
            }
        }

        title = cleanTitle(title);
        
        if (!title) continue;

        if (title.length < 100) { 
          seenIds.add(uniqueId);
          nodes.push({
            id: uniqueId,
            title: title,
            type: 'genre', 
            url: `https://vk.com/topic-${match[1]}_${match[2]}`,
            vkGroupId: match[1],
            vkTopicId: match[2],
            children: [],
            isLoaded: false
          });
        }
      }
    }
  }

  return nodes;
};

// Extrait les documents attachés (PDF, CBZ, CBR, ZIP) des commentaires VK
const extractDocuments = (items: any[]): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenUrls = new Set<string>();

  items.forEach(item => {
    if (item.attachments) {
      item.attachments.forEach((att: any) => {
        // On ne garde que les pièces jointes de type "doc"
        if (att.type === 'doc') {
          const doc = att.doc;
          const url = doc.url;
          
          if (seenUrls.has(url)) return;
          seenUrls.add(url);

          nodes.push({
            id: `doc_${doc.id}`,
            title: doc.title,
            type: 'file',
            extension: doc.ext.toUpperCase(), // ex: PDF
            url: url,
            isLoaded: true
          });
        }
      });
    }
  });
  return nodes;
};

// --- SERVICES PRINCIPAUX ---

// Fonction appelée par le bouton "Synchroniser"
export const fetchRootIndex = async (token: string): Promise<VkNode[]> => {
  try {
      // ID fixe du topic racine "INDEX"
      const response = await fetchVkTopic(token, '203785966', '47515406');
      
      if (!response.response || !response.response.items) {
        return MOCK_ROOT_NODES; // Fallback si l'API échoue
      }

      const fullText = response.response.items.map((i: any) => i.text).join('\n');
      const nodes = parseTopicBody(fullText);
      
      if (nodes.length === 0) {
          return MOCK_ROOT_NODES; // Fallback si parsing vide
      }
      
      return nodes.map(n => ({...n, type: 'category'}));
  } catch (error) {
      console.error("VK API Error (Root):", error);
      return MOCK_ROOT_NODES; // Fallback final
  }
};

// Fonction appelée pour charger le contenu d'un dossier
export const fetchNodeContent = async (token: string, node: VkNode): Promise<VkNode> => {
  if (!node.vkGroupId || !node.vkTopicId) {
       return { ...node, isLoaded: true, children: [] };
  }

  try {
      const response = await fetchVkTopic(token, node.vkGroupId, node.vkTopicId);
      
      if (!response.response || !response.response.items) {
        throw new Error("Failed to fetch node content");
      }

      const items = response.response.items;
      
      // ÉTAPE 1 : Chercher des sous-dossiers (Autres Topics cités)
      const fullText = items.map((i: any) => i.text).join('\n');
      const children = parseTopicBody(fullText);

      if (children.length > 0) {
        return {
          ...node,
          children: children,
          isLoaded: true,
          type: 'genre'
        };
      } 
      
      // ÉTAPE 2 : Si pas de sous-dossier, chercher des FICHIERS (Documents)
      const documents = extractDocuments(items);
      if (documents.length > 0) {
        return {
          ...node,
          children: documents,
          isLoaded: true,
          type: 'series' // C'est un dossier final qui contient des fichiers
        };
      }

      // Rien trouvé (Dossier vide)
      return { ...node, isLoaded: true, children: [] };

  } catch (error) {
      console.error("VK API Error (Node):", error);
      return { 
          ...node, 
          isLoaded: true, 
          children: [
              { id: 'err1', title: 'Erreur (API)', type: 'category', isLoaded: true }
          ] 
      };
  }
};
