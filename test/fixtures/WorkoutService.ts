// Copyright (c) 2025, 2026 Jon Verrier

export interface IWorkout {
   workoutId: string;
   title: string;
   scheduledDate: string;
   description: string;
   movementsJson: string;
}

export interface IWorkoutApiClient {
   getWorkout(workoutId: string): Promise<IWorkout>;
   listWorkouts(fromDate: string, toDate: string): Promise<IWorkout[]>;
   createWorkout(workout: Omit<IWorkout, 'workoutId'>): Promise<IWorkout>;
   updateWorkout(workoutId: string, updates: Partial<IWorkout>): Promise<IWorkout>;
}

/**
 * Service layer for workout management. Delegates persistence to an IWorkoutApiClient
 * and applies business rules such as date validation and duplicate detection.
 */
export class WorkoutService {
   constructor(private readonly apiClient: IWorkoutApiClient) {}

   /**
    * Returns the workout for the given ID, throwing if it cannot be found.
    */
   async getWorkout(workoutId: string): Promise<IWorkout> {
      if (!workoutId || workoutId.trim().length === 0) {
         throw new Error('workoutId must not be empty');
      }
      return this.apiClient.getWorkout(workoutId);
   }

   /**
    * Returns all workouts scheduled within a date range (inclusive).
    * Dates must be ISO 8601 format (YYYY-MM-DD).
    */
   async listWorkoutsForPeriod(fromDate: string, toDate: string): Promise<IWorkout[]> {
      if (fromDate > toDate) {
         throw new Error('fromDate must be on or before toDate');
      }
      return this.apiClient.listWorkouts(fromDate, toDate);
   }

   /**
    * Creates a new workout and returns the saved record with its assigned ID.
    */
   async addWorkout(workout: Omit<IWorkout, 'workoutId'>): Promise<IWorkout> {
      return this.apiClient.createWorkout(workout);
   }

   /**
    * Updates specific fields on an existing workout.
    */
   async updateWorkout(workoutId: string, updates: Partial<IWorkout>): Promise<IWorkout> {
      return this.apiClient.updateWorkout(workoutId, updates);
   }
}
