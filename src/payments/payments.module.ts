import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { DummyPaymentService } from './dummy-payment.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [PaymentsService, DummyPaymentService],
    controllers: [PaymentsController],
    exports: [PaymentsService, DummyPaymentService],
})
export class PaymentsModule { }
