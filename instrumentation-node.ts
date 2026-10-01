import { startMarketplaceSync } from '@/lib/services/marketplace';
import { startRecordingSweeper } from '@/lib/services/recordings';

startRecordingSweeper();
startMarketplaceSync();
