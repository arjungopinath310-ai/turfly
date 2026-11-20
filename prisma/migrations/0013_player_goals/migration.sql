-- Player profile: a weekly match goal, and a choice to stay off leaderboards.
ALTER TABLE "User" ADD COLUMN "weeklyGoal" INTEGER,
ADD COLUMN "hideFromLeaderboard" BOOLEAN NOT NULL DEFAULT false;
