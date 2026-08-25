import type { ProvenanceEntry } from '../../db';
import { computeFileAiBlame } from './blame';
import { verifyProvenanceChain, type ProvenanceVerificationResult } from './provenance';

export type TrustGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ModelAttribution {
  model: string;
  provider: string;
  lines: number;
  percentage: number;
  verifiedLines: number;
  failingLines: number;
  untestedLines: number;
  testPassRate: number;
}

export interface FileTrustScore {
  filePath: string;
  totalLines: number;
  aiLines: number;
  humanLines: number;
  aiRatio: number;
  verifiedAiLines: number;
  failingAiLines: number;
  untestedAiLines: number;
  testPassRate: number;
  score: number; // 0 to 100
  grade: TrustGrade;
  modelAttributions: ModelAttribution[];
  riskFactors: string[];
  highlights: string[];
  tamperProofChainValid: boolean;
}

export interface ProjectTrustScore {
  projectId: string;
  overallScore: number; // 0 to 100
  overallGrade: TrustGrade;
  totalFiles: number;
  totalLines: number;
  totalAiLines: number;
  totalHumanLines: number;
  aiRatio: number;
  totalVerifiedAiLines: number;
  totalFailingAiLines: number;
  totalUntestedAiLines: number;
  overallTestPassRate: number;
  chainIntegrity: ProvenanceVerificationResult;
  modelDistribution: ModelAttribution[];
  fileScores: FileTrustScore[];
  bisectCandidates: Array<{
    entryId: string;
    filePath: string;
    model?: string;
    rationale?: string;
    timestamp: number;
    failedTests?: string[];
    entryHash: string;
  }>;
}

/**
 * Converts a 0-100 numerical score into a letter grade.
 */
export function scoreToGrade(score: number): TrustGrade {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Returns color classes corresponding to a trust score or grade.
 */
export function getTrustColorStyles(score: number, theme: 'oled' | 'paper' | string = 'oled'): {
  text: string;
  bg: string;
  border: string;
  badge: string;
} {
  const isLight = theme === 'paper';
  if (score >= 90) {
    return {
      text: isLight ? 'text-emerald-700' : 'text-emerald-400',
      bg: isLight ? 'bg-emerald-50' : 'bg-emerald-950/40',
      border: isLight ? 'border-emerald-300' : 'border-emerald-800/60',
      badge: isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
    };
  }
  if (score >= 75) {
    return {
      text: isLight ? 'text-amber-700' : 'text-amber-400',
      bg: isLight ? 'bg-amber-50' : 'bg-amber-950/40',
      border: isLight ? 'border-amber-300' : 'border-amber-800/60',
      badge: isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-950/80 text-amber-300 border-amber-800/80'
    };
  }
  return {
    text: isLight ? 'text-rose-700' : 'text-rose-400',
    bg: isLight ? 'bg-rose-50' : 'bg-rose-950/40',
    border: isLight ? 'border-rose-300' : 'border-rose-800/60',
    badge: isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-950/80 text-rose-300 border-rose-800/80'
  };
}

/**
 * Computes a detailed Trust Score for a single file.
 */
export function calculateFileTrustScore(
  filePath: string,
  content: string,
  entries: ProvenanceEntry[],
  chainValid: boolean = true
): FileTrustScore {
  const blameResult = computeFileAiBlame(entries, content);
  const totalLines = Math.max(1, blameResult.lines.length);
  const lines = blameResult.lines;

  let humanLines = 0;
  let verifiedAiLines = 0;
  let failingAiLines = 0;
  let untestedAiLines = 0;

  const modelStats = new Map<string, {
    model: string;
    provider: string;
    lines: number;
    verifiedLines: number;
    failingLines: number;
    untestedLines: number;
  }>();

  for (const line of lines) {
    if (!line.entry) {
      humanLines++;
    } else {
      const entry = line.entry;
      const modelKey = `${entry.model || 'Unknown Model'}::${entry.provider || 'unknown'}`;
      let stat = modelStats.get(modelKey);
      if (!stat) {
        stat = {
          model: entry.model || 'Unknown Model',
          provider: entry.provider || 'unknown',
          lines: 0,
          verifiedLines: 0,
          failingLines: 0,
          untestedLines: 0
        };
        modelStats.set(modelKey, stat);
      }
      stat.lines++;

      const testRes = entry.testResult;
      if (testRes?.status === 'passed') {
        verifiedAiLines++;
        stat.verifiedLines++;
      } else if (testRes?.status === 'failed' || testRes?.status === 'error') {
        failingAiLines++;
        stat.failingLines++;
      } else {
        untestedAiLines++;
        stat.untestedLines++;
      }
    }
  }

  const aiLines = verifiedAiLines + failingAiLines + untestedAiLines;
  const aiRatio = aiLines / totalLines;

  // Weightings:
  // Human authored lines: 100
  // AI with passing tests: 100
  // AI untested / no tests: 85
  // AI with failing tests: 20
  let weightedPoints = 0;
  weightedPoints += humanLines * 100;
  weightedPoints += verifiedAiLines * 100;
  weightedPoints += untestedAiLines * 85;
  weightedPoints += failingAiLines * 20;

  let rawScore = Math.round(weightedPoints / totalLines);

  // If tamper-proof chain is invalid, heavily penalize trust
  if (!chainValid) {
    rawScore = Math.min(rawScore, 10);
  }

  const score = Math.max(0, Math.min(100, rawScore));
  const grade = scoreToGrade(score);

  const modelAttributions: ModelAttribution[] = Array.from(modelStats.values()).map(stat => {
    const testedTotal = stat.verifiedLines + stat.failingLines;
    return {
      model: stat.model,
      provider: stat.provider,
      lines: stat.lines,
      percentage: aiLines > 0 ? Math.round((stat.lines / aiLines) * 100) : 0,
      verifiedLines: stat.verifiedLines,
      failingLines: stat.failingLines,
      untestedLines: stat.untestedLines,
      testPassRate: testedTotal > 0 ? Math.round((stat.verifiedLines / testedTotal) * 100) : 100
    };
  }).sort((a, b) => b.lines - a.lines);

  const testedAiLines = verifiedAiLines + failingAiLines;
  const testPassRate = testedAiLines > 0 
    ? Math.round((verifiedAiLines / testedAiLines) * 100)
    : (untestedAiLines === 0 ? 100 : 100);

  const riskFactors: string[] = [];
  const highlights: string[] = [];

  if (!chainValid) {
    riskFactors.push('Cryptographic ledger integrity check failed — possible tampering detected.');
  }
  if (failingAiLines > 0) {
    riskFactors.push(`${failingAiLines} line${failingAiLines > 1 ? 's were' : ' was'} authored during a failing test run.`);
  }
  if (untestedAiLines > 0) {
    riskFactors.push(`${untestedAiLines} line${untestedAiLines > 1 ? 's have' : ' has'} no recorded test verification.`);
  }

  if (humanLines === totalLines) {
    highlights.push('100% human-authored / pristine origin.');
  } else {
    if (verifiedAiLines > 0) {
      highlights.push(`${verifiedAiLines} AI line${verifiedAiLines > 1 ? 's' : ''} verified by passing tests at patch time.`);
    }
    if (chainValid && aiLines > 0) {
      highlights.push('Cryptographic SHA-256 hash chain verified.');
    }
  }

  return {
    filePath,
    totalLines,
    aiLines,
    humanLines,
    aiRatio,
    verifiedAiLines,
    failingAiLines,
    untestedAiLines,
    testPassRate,
    score,
    grade,
    modelAttributions,
    riskFactors,
    highlights,
    tamperProofChainValid: chainValid
  };
}

/**
 * Computes a comprehensive Project / PR Trust Score across all files and provenance entries.
 */
export async function calculateProjectTrustScore(
  projectId: string,
  files: Array<{ path: string; content: string }>,
  allEntries: ProvenanceEntry[]
): Promise<ProjectTrustScore> {
  const chainIntegrity = await verifyProvenanceChain(allEntries);

  const entriesByFile = new Map<string, ProvenanceEntry[]>();
  for (const entry of allEntries) {
    const list = entriesByFile.get(entry.filePath) || [];
    list.push(entry);
    entriesByFile.set(entry.filePath, list);
  }

  const fileScores: FileTrustScore[] = [];
  let totalLines = 0;
  let totalAiLines = 0;
  let totalHumanLines = 0;
  let totalVerifiedAiLines = 0;
  let totalFailingAiLines = 0;
  let totalUntestedAiLines = 0;

  const projectModelStats = new Map<string, {
    model: string;
    provider: string;
    lines: number;
    verifiedLines: number;
    failingLines: number;
    untestedLines: number;
  }>();

  for (const file of files) {
    const fileEntries = entriesByFile.get(file.path) || [];
    const scoreResult = calculateFileTrustScore(file.path, file.content, fileEntries, chainIntegrity.valid);
    fileScores.push(scoreResult);

    totalLines += scoreResult.totalLines;
    totalAiLines += scoreResult.aiLines;
    totalHumanLines += scoreResult.humanLines;
    totalVerifiedAiLines += scoreResult.verifiedAiLines;
    totalFailingAiLines += scoreResult.failingAiLines;
    totalUntestedAiLines += scoreResult.untestedAiLines;

    for (const attr of scoreResult.modelAttributions) {
      const key = `${attr.model}::${attr.provider}`;
      let stat = projectModelStats.get(key);
      if (!stat) {
        stat = {
          model: attr.model,
          provider: attr.provider,
          lines: 0,
          verifiedLines: 0,
          failingLines: 0,
          untestedLines: 0
        };
        projectModelStats.set(key, stat);
      }
      stat.lines += attr.lines;
      stat.verifiedLines += attr.verifiedLines;
      stat.failingLines += attr.failingLines;
      stat.untestedLines += attr.untestedLines;
    }
  }

  const modelDistribution: ModelAttribution[] = Array.from(projectModelStats.values()).map(stat => {
    const testedTotal = stat.verifiedLines + stat.failingLines;
    return {
      model: stat.model,
      provider: stat.provider,
      lines: stat.lines,
      percentage: totalAiLines > 0 ? Math.round((stat.lines / totalAiLines) * 100) : 0,
      verifiedLines: stat.verifiedLines,
      failingLines: stat.failingLines,
      untestedLines: stat.untestedLines,
      testPassRate: testedTotal > 0 ? Math.round((stat.verifiedLines / testedTotal) * 100) : 100
    };
  }).sort((a, b) => b.lines - a.lines);

  // Overall Score Calculation
  let overallScore = 100;
  if (totalLines > 0) {
    let weightedSum = 0;
    for (const fs of fileScores) {
      weightedSum += fs.score * fs.totalLines;
    }
    overallScore = Math.round(weightedSum / totalLines);
  }

  if (!chainIntegrity.valid) {
    overallScore = Math.min(overallScore, 10);
  }

  const overallGrade = scoreToGrade(overallScore);
  const aiRatio = totalLines > 0 ? totalAiLines / totalLines : 0;
  const testedAiTotal = totalVerifiedAiLines + totalFailingAiLines;
  const overallTestPassRate = testedAiTotal > 0 
    ? Math.round((totalVerifiedAiLines / testedAiTotal) * 100) 
    : 100;

  // Identify any suspicious / failing patches for one-click bisect
  const bisectCandidates = allEntries
    .filter(e => e.testResult?.status === 'failed' || e.testResult?.status === 'error')
    .map(e => ({
      entryId: e.id,
      filePath: e.filePath,
      model: e.model,
      rationale: e.rationale,
      timestamp: e.timestamp,
      failedTests: e.testResult?.failedTests,
      entryHash: e.entryHash
    }));

  // Sort files by lowest score first so problematic files appear on top
  fileScores.sort((a, b) => a.score - b.score);

  return {
    projectId,
    overallScore,
    overallGrade,
    totalFiles: files.length,
    totalLines,
    totalAiLines,
    totalHumanLines,
    aiRatio,
    totalVerifiedAiLines,
    totalFailingAiLines,
    totalUntestedAiLines,
    overallTestPassRate,
    chainIntegrity,
    modelDistribution,
    fileScores,
    bisectCandidates
  };
}

/**
 * Formats a project trust score into Markdown suitable for PR descriptions or audit reports.
 */
export function generateTrustMarkdownReport(trust: ProjectTrustScore): string {
  const lines: string[] = [];
  const pctAi = Math.round(trust.aiRatio * 100);
  const pctHuman = 100 - pctAi;
  const chainBadge = trust.chainIntegrity.valid 
    ? '🔒 Verified Intact (SHA-256 Ledger)' 
    : '⚠️ Tampering Detected';

  lines.push(`## 🛡️ AI Provenance & Trust Report`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| **Trust Score** | **${trust.overallScore}/100 (Grade ${trust.overallGrade})** |`);
  lines.push(`| **Ledger Integrity** | ${chainBadge} |`);
  lines.push(`| **AI vs Human Code** | ${pctAi}% AI (${trust.totalAiLines} lines) / ${pctHuman}% Human (${trust.totalHumanLines} lines) |`);
  lines.push(`| **Test Verification Rate** | ${trust.overallTestPassRate}% passing at patch creation |`);
  lines.push(`| **Total Changeset** | ${trust.totalFiles} files, ${trust.totalLines} lines |`);
  lines.push(``);

  if (trust.modelDistribution.length > 0) {
    lines.push(`### 🤖 Model Attribution Breakdown`);
    lines.push(``);
    lines.push(`| Model | Provider | AI Lines | % of AI | Test Pass Rate |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const m of trust.modelDistribution) {
      lines.push(`| \`${m.model}\` | ${m.provider} | ${m.lines} | ${m.percentage}% | ${m.testPassRate}% |`);
    }
    lines.push(``);
  }

  lines.push(`### 📁 Per-File Trust Breakdown`);
  lines.push(``);
  lines.push(`| File | Trust Score | Grade | AI % | Test Status at Patch |`);
  lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
  for (const f of trust.fileScores) {
    const fAiPct = Math.round(f.aiRatio * 100);
    const testStatus = f.failingAiLines > 0 
      ? `❌ ${f.failingAiLines} failing` 
      : (f.verifiedAiLines > 0 ? `✅ ${f.verifiedAiLines} verified` : '⚪ Untested');
    lines.push(`| \`${f.filePath}\` | ${f.score}% | ${f.grade} | ${fAiPct}% | ${testStatus} |`);
  }
  lines.push(``);
  lines.push(`*Generated cryptographically by LAIDE Studio AI Provenance Engine.*`);

  return lines.join('\n');
}
