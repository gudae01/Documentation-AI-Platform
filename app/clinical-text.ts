export type ClinicalTextSection = {
  title: string;
  lines: string[];
};

const SECTION_ALIASES: Record<string, string> = {
  '주소': '주호소',
  '주 증상': '주호소',
  '과거 병력': '과거력',
  '기왕력': '과거력',
  '복용 약': '복용약',
  '투약': '복용약',
  '처방약': '복용약',
  '의사소견': '의사 소견',
};

const BARE_SECTION_TITLES = new Set([
  '발병일', '발병동기',
  '주소', '주호소', '주 증상',
  'P/I', 'PI', '현병력',
  '가족력', 'F/H',
  '과거력', '과거 병력', '기왕력', 'P/H',
  '복용약', '복용 약', '투약', '처방약',
  '검사', '검사결과', '검사 결과',
  '진단', '진단명', '치료력', '수술력', '알레르기', '사회력',
  '의사소견', '의사 소견',
]);

// A field name must start with a letter and cannot contain chart-value delimiters
// such as brackets. This keeps `1. Parkinson disease[O/S(Rt.): ...]` inside P/I.
const INLINE_FIELD = /^([가-힣A-Za-z][가-힣A-Za-z0-9\s/&().+-]{0,39}):\s*(.*)$/;

export function organizeClinicalText(text: string): ClinicalTextSection[] {
  const sections: ClinicalTextSection[] = [];
  let currentSection: ClinicalTextSection | null = null;

  const getSection = (rawTitle: string) => {
    const cleanedTitle = rawTitle.trim();
    const title = SECTION_ALIASES[cleanedTitle] ?? cleanedTitle;
    const existing = sections.find((section) => section.title === title);
    if (existing) return existing;
    const section = { title, lines: [] as string[] };
    sections.push(section);
    return section;
  };

  text
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const bareTitle = line.replace(/:\s*$/, '').trim();
      if (BARE_SECTION_TITLES.has(bareTitle) && (line === bareTitle || /:\s*$/.test(line))) {
        currentSection = getSection(bareTitle);
        return;
      }

      const inlineField = line.match(INLINE_FIELD);
      if (inlineField) {
        currentSection = getSection(inlineField[1]);
        if (inlineField[2].trim()) {
          currentSection.lines.push(inlineField[2].replace(/^[-•]\s*/, ''));
        }
        return;
      }

      if (!currentSection) {
        const inferredTitle = /mmHg|bpm|혈압|맥박|체온|혈당|Hb|WBC|Glucose/i.test(line)
          ? '검사 및 활력징후'
          : /mg|복용|투약|약물|처방/i.test(line) ? '복용약' : '기타 진료 정보';
        currentSection = getSection(inferredTitle);
      }
      currentSection.lines.push(line.replace(/^[-•]\s*/, ''));
    });

  return sections.filter((section) => section.lines.length > 0);
}
