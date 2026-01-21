import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async create(userId: string, createDto: CreateSubmissionDto) {
    // Fetch real user data from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is registered for this hackathon
    const participation = await this.prisma.hackathonParticipant.findUnique({
      where: {
        userId_hackathonId: {
          userId: userId,
          hackathonId: createDto.hackathonId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!participation) {
      throw new ForbiddenException('You must be registered for this hackathon to submit');
    }

    // Create submission in database
    const submission = await this.prisma.submission.create({
      data: {
        title: createDto.title,
        description: createDto.description,
        hackathonId: createDto.hackathonId,
        participantId: participation.id,
        teamId: createDto.teamId,
        status: createDto.isDraft ? 'DRAFT' : 'SUBMITTED',
        submittedAt: createDto.isDraft ? null : new Date(),
      },
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Create submission files if provided
    if (createDto.files && createDto.files.length > 0) {
      await Promise.all(
        createDto.files.map((file: any) =>
          this.prisma.submissionFile.create({
            data: {
              submissionId: submission.id,
              fileName: file.name || 'Unknown',
              fileUrl: file.url || '',
              fileType: file.type || 'application/octet-stream',
              fileSize: file.size || 0,
            },
          })
        )
      );
    }

    return {
      ...submission,
      submitter: submission.participant?.user,
      teamInfo: submission.team,
      files: createDto.files || [],
    };
  }

  async findAll(filters?: { hackathonId?: string; userId?: string; teamId?: string; status?: string; isDraft?: boolean }, userRole?: string, userId?: string) {
    const where: any = {};

    if (filters?.hackathonId) {
      where.hackathonId = filters.hackathonId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.teamId) {
      where.teamId = filters.teamId;
    }

    // Apply userId filter if explicitly provided
    if (filters?.userId) {
      where.participant = {
        userId: filters.userId,
      };
    }

    // Role-based filtering - ONLY filter for participants when they don't specify userId
    if (userRole === 'PARTICIPANT' && !filters?.userId) {
      where.participant = {
        userId: userId,
      };
    }

    const submissions = await this.prisma.submission.findMany({
      where,
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        files: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return submissions.map((submission) => ({
      ...submission,
      submitter: submission.participant?.user,
      teamInfo: submission.team,
      isDraft: submission.status === 'DRAFT',
      isFinal: submission.status === 'SUBMITTED',
      submitterId: submission.participant?.userId,
    }));
  }

  async findOne(id: string, userRole?: string, userId?: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        files: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Role-based access control
    const canAccessFiles = userRole === 'ORGANIZER' || userRole === 'JUDGE' || userRole === 'ADMIN';
    const isOwner = userId && submission.participant?.userId === userId;

    if (!canAccessFiles && !isOwner) {
      throw new ForbiddenException('Access denied');
    }

    return {
      ...submission,
      submitter: submission.participant?.user,
      teamInfo: submission.team,
      isDraft: submission.status === 'DRAFT',
      isFinal: submission.status === 'SUBMITTED',
      submitterId: submission.participant?.userId,
    };
  }

  async update(userId: string, id: string, updateDto: UpdateSubmissionDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.participant?.userId !== userId) {
      throw new ForbiddenException('You can only update your own submissions');
    }

    const updatedSubmission = await this.prisma.submission.update({
      where: { id },
      data: {
        title: updateDto.title,
        description: updateDto.description,
        repoUrl: updateDto.repositoryUrl,
        demoUrl: updateDto.liveUrl,
        status: updateDto.isDraft ? 'DRAFT' : 'SUBMITTED',
        submittedAt: updateDto.isDraft ? null : new Date(),
        updatedAt: new Date(),
      },
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        files: true,
      },
    });

    return {
      ...updatedSubmission,
      submitter: updatedSubmission.participant?.user,
      teamInfo: updatedSubmission.team,
      isDraft: updatedSubmission.status === 'DRAFT',
      isFinal: updatedSubmission.status === 'SUBMITTED',
      submitterId: updatedSubmission.participant?.user?.id,
    };
  }

  async remove(userId: string, id: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        participant: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.participant?.userId !== userId) {
      throw new ForbiddenException('You can only delete your own submissions');
    }

    await this.prisma.submission.delete({
      where: { id },
    });

    return { message: 'Submission deleted successfully' };
  }
}