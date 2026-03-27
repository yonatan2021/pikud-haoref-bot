/**
 * סקריפט בדיקה — שולח התרעת דמה אחת לכל קטגוריית נושא
 * הרצה: npx tsx test-alert.ts
 */
import 'dotenv/config';
import { generateMapImage } from './src/mapService';
import { sendAlert } from './src/telegramBot';
import { getTopicId } from './src/topicRouter';
import { Alert } from './src/types';

interface TestCase {
  label: string;
  alert: Alert;
}

const TEST_CASES: TestCase[] = [
  {
    label: 'ביטחוני',
    alert: {
      type: 'missiles',
      cities: ['תל אביב - מרכז', 'רמת גן', 'גבעתיים', 'חולון'],
      instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    },
  },
  {
    label: 'אסונות טבע (28 ערים)',
    alert: {
      type: 'earthQuake',
      cities: [
        'תל אביב - מרכז', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה',
        'אשדוד', 'נתניה', 'באר שבע', 'בני ברק', 'רמת גן',
        'חולון', 'בת ים', 'רחובות', 'אשקלון', 'הרצליה',
        'כפר סבא', 'רעננה', 'מודיעין', 'לוד', 'רמלה',
        'רהט', 'נצרת', 'עכו', 'נהריה', 'טבריה',
        'אילת', 'צפת', 'קריית שמונה',
      ],
      instructions: 'הישארו בבניין, התרחקו מחלונות',
    },
  },
  {
    label: 'סביבתי',
    alert: {
      type: 'hazardousMaterials',
      cities: ['חיפה', 'קריית אתא'],
      instructions: 'היכנסו לחלל סגור, סגרו חלונות ומיזוג',
    },
  },
  {
    label: 'תרגיל',
    alert: {
      type: 'missilesDrill',
      cities: ['ירושלים', 'בית שמש'],
      instructions: 'זוהי בדיקת מערכת בלבד',
    },
  },
  {
    label: 'כללי',
    alert: {
      type: 'newsFlash',
      cities: [],
      instructions: 'עדכון מערכת פיקוד העורף',
    },
  },
];

async function runTestCase(tc: TestCase, index: number, total: number): Promise<boolean> {
  const topicId = getTopicId(tc.alert.type);
  const topicStr = topicId != null ? `topic ${topicId}` : 'צ\'אט ראשי';
  console.log(`[${index}/${total}] שולח: ${tc.alert.type} → ${topicStr} (${tc.label}) — ${tc.alert.cities.length} ערים`);

  try {
    const imageBuffer = await generateMapImage(tc.alert);
    if (imageBuffer) {
      console.log(`       תמונת מפה: ${imageBuffer.length} bytes`);
    }
    await sendAlert(tc.alert, imageBuffer, topicId);
    return true;
  } catch (err) {
    console.error(`       ❌ שגיאה:`, err);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`מתחיל בדיקה — ${TEST_CASES.length} התרעות\n`);

  let successCount = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const success = await runTestCase(TEST_CASES[i], i + 1, TEST_CASES.length);
    if (success) successCount++;

    if (i < TEST_CASES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n${successCount === TEST_CASES.length ? '✅' : '⚠️'} סיום — ${successCount}/${TEST_CASES.length} נשלחו`);
  process.exit(0);
}

main();
