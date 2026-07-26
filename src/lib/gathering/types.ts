import type { JourneyClientModule } from "@/lib/journey/types";

export type GatheringPhase = "FORMING" | "ASSIGNED";

export type ParticipantMember = {
  id: string;
  name: string;
  isCoordinator: boolean;
};

export type ParticipantJourneyState =
  | {
      state: "GATHERING";
      journeyName: string;
      expectedState: "gathering";
      joinedInProgress: boolean;
    }
  | {
      state: "ACTIVE";
      journeyName: string;
      expectedState: string;
      joinedInProgress: boolean;
      module: JourneyClientModule & {
        id: string;
        title: string;
        recommendedSeconds: number;
        startedAt: string;
        serverTime: string;
      };
    }
  | {
      state: "COMPLETED";
      journeyName: string;
      expectedState: "completed";
      joinedInProgress: boolean;
    };

export type ParticipantSnapshot =
  | { state: "JOIN"; revision: number }
  | {
      state: "LOBBY";
      revision: number;
      participant: { id: string; name: string };
      participantCount: number;
    }
  | {
      state: "ROOM";
      revision: number;
      participant: { id: string; name: string };
      room: {
        id: string;
        name: string;
        directions: string;
        members: ParticipantMember[];
      };
      journey?: ParticipantJourneyState;
    };

export type OrganizerRoomSnapshot = {
  id: string;
  name: string;
  directions: string;
  maxCapacity: number | null;
  memberCount: number;
  coordinatorName: string | null;
  journeyState: "unavailable" | "gathering" | "active" | "completed";
  members: ParticipantMember[];
};

export type OrganizerSnapshot = {
  phase: GatheringPhase;
  revision: number;
  participantCount: number;
  capacitySufficient: boolean;
  journey: {
    available: boolean;
    name: string | null;
  };
  rooms: OrganizerRoomSnapshot[];
};
