
import { performance } from 'perf_hooks';

// --- Helper Functions & Constants (Original) ---

const RE_CLEAN_ARROW_SUFFIX = /\s*[-–—=]+[>→»]\s*.*$/i;
const RE_CLEAN_URL_SUFFIX = /https?:\/\/.*$/i;
const RE_CLEAN_TRAILING_PUNCT = /[:\->]+$/;
const RE_CLEAN_LEADING_DECORATION = /^\s*[•*·\-"»«]+\s*/;
const RE_CLEAN_TRAILING_DECORATION = /\s*[•*·\-"»«]+\s*$/;
const RE_CLEAN_LIEN_TAG = /\(lien\)/gi;

const cleanTitle = (text) => {
  return text
    .replace(RE_CLEAN_ARROW_SUFFIX, '')
    .replace(RE_CLEAN_URL_SUFFIX, '')
    .replace(RE_CLEAN_TRAILING_PUNCT, '')
    .replace(RE_CLEAN_LEADING_DECORATION, '')
    .replace(RE_CLEAN_TRAILING_DECORATION, '')
    .replace(RE_CLEAN_LIEN_TAG, '')
    .trim();
};

// --- Original Implementation ---

const parseTopicBodyOriginal = (items, excludeTopicId) => {
  const nodes = [];
  const seenIds = new Set();

  const bbcodeRegex = /\[topic-(\d+)_(\d+)\|([^\]]+)\]/g;
  const mentionRegex = /@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?/g;
  const lineUrlRegex = /vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/g;

  // === Pass 1. Parser les BBCode VK: [topic-GROUP_TOPIC|Texte] ===
  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    bbcodeRegex.lastIndex = 0;
    let bbMatch;
    while ((bbMatch = bbcodeRegex.exec(text)) !== null) {
      const [, groupId, topicId, linkText] = bbMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = cleanTitle(linkText);
      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        seenIds.add(uniqueId);
        nodes.push({
          id: uniqueId,
          title,
          type: 'genre',
          url: `https://vk.com/topic-${groupId}_${topicId}`,
          vkGroupId: groupId,
          vkTopicId: topicId,
          children: [],
          isLoaded: false,
        });
      }
    }
  }

  // === Pass 2. Parser les mentions: @topic-GROUP_TOPIC (Titre) ===
  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    mentionRegex.lastIndex = 0;
    let mentionMatch;
    while ((mentionMatch = mentionRegex.exec(text)) !== null) {
      const [, groupId, topicId, postId, linkText] = mentionMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = linkText ? cleanTitle(linkText) : `Topic ${topicId}`;
      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        seenIds.add(uniqueId);
        nodes.push({
          id: uniqueId,
          title,
          type: 'genre',
          url: `https://vk.com/topic-${groupId}_${topicId}`,
          vkGroupId: groupId,
          vkTopicId: topicId,
          children: [],
          isLoaded: false,
        });
      }
    }
  }

  // === Pass 3. Parser les URLs en clair (fallback) ===
  let previousLine = '';

  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('vk.com/topic-')) continue;

      lineUrlRegex.lastIndex = 0;
      let match;

      while ((match = lineUrlRegex.exec(line)) !== null) {
        const [, groupId, topicId, postId] = match;
        if (excludeTopicId && topicId === excludeTopicId) continue;

        const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
        if (seenIds.has(uniqueId)) continue;

        let title = '';

        const afterMatch = line.substring(match.index + match[0].length);
        const pipeMatch = afterMatch.match(/^\|([^\]]+)\]/);
        if (pipeMatch) {
          title = pipeMatch[1].trim();
        }

        if (!title) {
          const beforeMatch = line.substring(0, match.index);
          const rawTitle = beforeMatch.replace(/https?:\/\/$/, '').trim();

          if (rawTitle.length > 2) {
            title = rawTitle;
          } else {
            if (i > 0) {
              const prevLine = lines[i - 1];
              if (!prevLine.includes('vk.com') && prevLine.length > 2) {
                title = prevLine;
              }
            } else if (previousLine) {
              if (!previousLine.includes('vk.com') && previousLine.length > 2) {
                title = previousLine;
              }
            }
          }
        }

        if (!title) {
          const afterUrl = line.substring(match.index + match[0].length).trim();
          if (afterUrl.length > 2 && !afterUrl.includes('vk.com')) {
            title = afterUrl;
          }
        }

        title = cleanTitle(title);
        if (!title || title.length < 2) title = `Topic ${topicId}`;

        if (title.length < 200) {
          seenIds.add(uniqueId);
          nodes.push({
            id: uniqueId,
            title,
            type: 'genre',
            url: `https://vk.com/topic-${groupId}_${topicId}`,
            vkGroupId: groupId,
            vkTopicId: topicId,
            children: [],
            isLoaded: false,
          });
        }
      }
    }

    if (lines.length > 0) {
      previousLine = lines[lines.length - 1];
    }
  }

  return nodes;
};

// --- Optimized Implementation ---

const bbcodeRegexGlobal = /\[topic-(\d+)_(\d+)\|([^\]]+)\]/g;
const mentionRegexGlobal = /@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?/g;
const lineUrlRegexGlobal = /vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/g;

const parseTopicBodyOptimized = (items, excludeTopicId) => {
  const nodes = [];
  const seenIds = new Set();

  // === Pass 1. Parser les BBCode VK ===
  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    bbcodeRegexGlobal.lastIndex = 0;
    let bbMatch;
    while ((bbMatch = bbcodeRegexGlobal.exec(text)) !== null) {
      const [, groupId, topicId, linkText] = bbMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = cleanTitle(linkText);
      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        seenIds.add(uniqueId);
        nodes.push({
          id: uniqueId,
          title,
          type: 'genre',
          url: `https://vk.com/topic-${groupId}_${topicId}`,
          vkGroupId: groupId,
          vkTopicId: topicId,
          children: [],
          isLoaded: false,
        });
      }
    }
  }

  // === Pass 2. Parser les mentions ===
  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    mentionRegexGlobal.lastIndex = 0;
    let mentionMatch;
    while ((mentionMatch = mentionRegexGlobal.exec(text)) !== null) {
      const [, groupId, topicId, postId, linkText] = mentionMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      // FIXED: Added safety check for linkText
      let title = linkText ? cleanTitle(linkText) : `Topic ${topicId}`;

      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        seenIds.add(uniqueId);
        nodes.push({
          id: uniqueId,
          title,
          type: 'genre',
          url: `https://vk.com/topic-${groupId}_${topicId}`,
          vkGroupId: groupId,
          vkTopicId: topicId,
          children: [],
          isLoaded: false,
        });
      }
    }
  }

  // === Pass 3. Parser les URLs en clair (Optimized) ===
  let globalPrevLine = '';

  for (const item of items) {
    const text = item.text || '';
    if (!text) continue;

    let start = 0;
    let localPrevLine = globalPrevLine;

    while (start < text.length) {
      let end = text.indexOf('\n', start);
      if (end === -1) end = text.length;

      const line = text.substring(start, end).trim();
      start = end + 1;

      if (line.length === 0) continue;

      if (line.includes('vk.com/topic-')) {
          lineUrlRegexGlobal.lastIndex = 0;
          let match;

          while ((match = lineUrlRegexGlobal.exec(line)) !== null) {
            const [, groupId, topicId, postId] = match;
            if (excludeTopicId && topicId === excludeTopicId) continue;

            const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
            if (seenIds.has(uniqueId)) continue;

            let title = '';

            const afterMatch = line.substring(match.index + match[0].length);
            const pipeMatch = afterMatch.match(/^\|([^\]]+)\]/);
            if (pipeMatch) {
              title = pipeMatch[1].trim();
            }

            if (!title) {
              const beforeMatch = line.substring(0, match.index);
              const rawTitle = beforeMatch.replace(/https?:\/\/$/, '').trim();

              if (rawTitle.length > 2) {
                title = rawTitle;
              } else {
                if (localPrevLine && !localPrevLine.includes('vk.com') && localPrevLine.length > 2) {
                   title = localPrevLine;
                }
              }
            }

            if (!title) {
              const afterUrl = line.substring(match.index + match[0].length).trim();
              if (afterUrl.length > 2 && !afterUrl.includes('vk.com')) {
                title = afterUrl;
              }
            }

            title = cleanTitle(title);
            if (!title || title.length < 2) title = `Topic ${topicId}`;

            if (title.length < 200) {
              seenIds.add(uniqueId);
              nodes.push({
                id: uniqueId,
                title,
                type: 'genre',
                url: `https://vk.com/topic-${groupId}_${topicId}`,
                vkGroupId: groupId,
                vkTopicId: topicId,
                children: [],
                isLoaded: false,
              });
            }
          }
      }

      localPrevLine = line;
    }

    globalPrevLine = localPrevLine;
  }

  return nodes;
};

// --- Mock Data Generator ---

const generateMockItems = (count) => {
  const items = [];
  const titles = ['Naruto', 'One Piece', 'Dragon Ball', 'Bleach', 'Fairy Tail', 'Attack on Titan', 'Death Note'];

  for (let i = 0; i < count; i++) {
    const type = Math.random();
    const title = titles[Math.floor(Math.random() * titles.length)];
    const groupId = '203785966';
    const topicId = 40000000 + i;

    let text = '';

    if (type < 0.4) {
      // BBCode
      text = `Here is a link: [topic-${groupId}_${topicId}|${title} Tome ${i}]`;
    } else if (type < 0.7) {
      // Mention
      // 50% chance of no title (Regression test)
      if (Math.random() > 0.5) {
         text = `Also check @topic-${groupId}_${topicId} (${title} Chapter ${i})`;
      } else {
         text = `Also check @topic-${groupId}_${topicId}`;
      }
    } else if (type < 0.9) {
      // Plain URL (same line)
      text = `${title} Volume ${i} -> https://vk.com/topic-${groupId}_${topicId}`;
    } else {
      // Plain URL (multiline)
      text = `${title} Special ${i}\nhttps://vk.com/topic-${groupId}_${topicId}`;
    }

    // Add some noise/garbage text
    if (Math.random() > 0.5) {
      text = "Some random text before.\n" + text + "\nSome random text after.";
    }

    items.push({ text });
  }

  return items;
};

// --- Benchmark Runner ---

const runBenchmark = () => {
  console.log('Generating mock data...');
  const itemCount = 50000;
  const items = generateMockItems(itemCount);
  console.log(`Generated ${items.length} items.`);

  console.log('Running Original...');
  const startOriginal = performance.now();
  const resOriginal = parseTopicBodyOriginal(items);
  const endOriginal = performance.now();
  const timeOriginal = endOriginal - startOriginal;
  console.log(`Original Time: ${timeOriginal.toFixed(2)}ms`);
  console.log(`Original Result Count: ${resOriginal.length}`);

  console.log('Running Optimized...');
  try {
    const startOptimized = performance.now();
    const resOptimized = parseTopicBodyOptimized(items);
    const endOptimized = performance.now();
    const timeOptimized = endOptimized - startOptimized;
    console.log(`Optimized Time: ${timeOptimized.toFixed(2)}ms`);
    console.log(`Optimized Result Count: ${resOptimized.length}`);

    // Verify Correctness
    if (resOriginal.length !== resOptimized.length) {
      console.error('ERROR: Result counts do not match!');
      console.log(`Original: ${resOriginal.length}, Optimized: ${resOptimized.length}`);
    } else {
      // Check deep equality (simplified for benchmark)
      let match = true;
      for(let i=0; i<resOriginal.length; i++) {
          if(resOriginal[i].id !== resOptimized[i].id || resOriginal[i].title !== resOptimized[i].title) {
              match = false;
              console.error(`Mismatch at index ${i}:`, resOriginal[i], resOptimized[i]);
              break;
          }
      }
      if(match) console.log('SUCCESS: Results match!');
      else console.error('ERROR: Results do not match content!');
    }

    const improvement = timeOriginal - timeOptimized;
    const pct = (improvement / timeOriginal) * 100;
    console.log(`Improvement: ${improvement.toFixed(2)}ms (${pct.toFixed(2)}%)`);
  } catch (e) {
      console.error("CRASH DETECTED IN OPTIMIZED:", e);
  }
};

runBenchmark();
